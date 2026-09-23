/** Retain one logical mount request across effect replay; a new key explicitly starts a new attempt. */
export class OwnedRequest<T> {
  private current: { owner: object; key: string; promise: Promise<T> } | undefined;

  get(owner: object, key: string, start: () => Promise<T>): Promise<T> {
    if (this.current?.owner === owner && this.current.key === key) return this.current.promise;
    // Defer invocation so synchronous throws become rejections and replay can attach before progress arrives.
    const promise = Promise.resolve().then(start);
    this.current = { owner, key, promise };
    return promise;
  }
}
