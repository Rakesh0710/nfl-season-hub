import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataError } from '@/lib/data'
import { useAsync } from '@/lib/useAsync'

/** A promise this test resolves by hand, so two requests can be interleaved. */
function deferred<T>() {
  let settle!: (value: T) => void
  let fail!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

describe('useAsync', () => {
  it('starts loading and reports the data when it arrives', async () => {
    const { result } = renderHook(() => useAsync('a', () => Promise.resolve(['one'])))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current).toMatchObject({ status: 'success', data: ['one'] })
  })

  it('reports a DataError unchanged, so the UI can branch on its kind', async () => {
    const error = new DataError('not-found', '/data/x.json', 'gone', 404)
    const { result } = renderHook(() => useAsync('a', () => Promise.reject(error)))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ status: 'error', error })
  })

  it('wraps an unexpected throw rather than crashing the page', async () => {
    const { result } = renderHook(() => useAsync('a', () => Promise.reject(new Error('boom'))))
    await waitFor(() => expect(result.current.status).toBe('error'))
    if (result.current.status !== 'error') throw new Error('expected an error state')
    expect(result.current.error).toBeInstanceOf(DataError)
    expect(result.current.error.message).toBe('boom')
  })

  it('retries by issuing a genuinely new request', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered')

    const { result } = renderHook(() => useAsync('a', load))
    await waitFor(() => expect(result.current.status).toBe('error'))
    const errored = result.current
    if (errored.status !== 'error') throw new Error('expected an error state')

    act(() => errored.retry())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('goes back to loading the moment the key changes', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => useAsync(key, () => Promise.resolve(key)),
      {
        initialProps: { key: 'a' },
      },
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ key: 'b' })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'success', data: 'b' }))
  })

  it('does not let a slow first request overwrite a fast second one', async () => {
    // Opening one team and immediately clicking another: the first response
    // arrives last, and must not paint the page it no longer belongs to.
    const slow = deferred<string>()
    const fast = deferred<string>()
    const loaders: Record<string, Promise<string>> = { a: slow.promise, b: fast.promise }

    const { result, rerender } = renderHook(({ key }) => useAsync(key, () => loaders[key]!), {
      initialProps: { key: 'a' },
    })

    rerender({ key: 'b' })
    await act(async () => {
      fast.settle('b')
    })
    expect(result.current).toMatchObject({ status: 'success', data: 'b' })

    await act(async () => {
      slow.settle('a')
    })
    expect(result.current).toMatchObject({ status: 'success', data: 'b' })
  })

  it('does not refetch when the loader closure changes but the key does not', async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValue('same')
    const { result, rerender } = renderHook(() => useAsync('a', () => load()))
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender()
    rerender()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
