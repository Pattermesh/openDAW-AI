// Maps stable, human-readable string handles ("track_1") to live objects. The MCP/tool
// protocol is stateless JSON — the model can't hold object references — so we hand back ids
// and resolve them on later calls. Monotonic per-prefix counters: O(1), readable, collision-free.
export class IdRegistry {
  readonly #items = new Map<string, unknown>()
  readonly #counters = new Map<string, number>()
  add(prefix: string, value: unknown): string {
    const next = (this.#counters.get(prefix) ?? 0) + 1
    this.#counters.set(prefix, next)
    const id = `${prefix}_${next}`
    this.#items.set(id, value)
    return id
  }
  get<T>(id: string): T {
    const value = this.#items.get(id)
    if (value === undefined) throw new Error(`Unknown id: ${id}`)
    return value as T
  }
  clear(): void { this.#items.clear(); this.#counters.clear() }
}
