export function fakeBucket(
  objects: Record<string, { body: string; uploaded?: Date }>,
): R2Bucket {
  const store = new Map(
    Object.entries(objects).map(([key, value]) => [
      key,
      {
        key,
        body: value.body,
        uploaded: value.uploaded ?? new Date("2026-11-15T00:00:00Z"),
        size: new TextEncoder().encode(value.body).length,
      },
    ]),
  );

  return {
    async head(key: string) {
      const obj = store.get(key);
      if (!obj) return null;
      return {
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
      } as R2Object;
    },
    async get(key: string) {
      const obj = store.get(key);
      if (!obj) return null;
      return {
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        async text() {
          return obj.body;
        },
        async json() {
          return JSON.parse(obj.body);
        },
        async arrayBuffer() {
          return new TextEncoder().encode(obj.body).buffer;
        },
      } as R2ObjectBody;
    },
    async list(options: R2ListOptions = {}) {
      const prefix = options.prefix ?? "";
      const cursor = options.cursor ?? "";
      const limit = options.limit ?? 1000;
      const keys = [...store.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort();
      const start = cursor ? keys.findIndex((key) => key > cursor) : 0;
      const slice = keys.slice(Math.max(start, 0), Math.max(start, 0) + limit);
      const truncated = Math.max(start, 0) + limit < keys.length;
      return {
        objects: slice.map((key) => {
          const obj = store.get(key)!;
          return {
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded,
          } as R2Object;
        }),
        truncated,
        cursor: truncated ? slice[slice.length - 1] : undefined,
      };
    },
    async put() {
      throw new Error("put not implemented in fakeBucket");
    },
    async delete() {
      throw new Error("delete not implemented in fakeBucket");
    },
    async createMultipartUpload() {
      throw new Error("createMultipartUpload not implemented in fakeBucket");
    },
    async resumeMultipartUpload() {
      throw new Error("resumeMultipartUpload not implemented in fakeBucket");
    },
  } as unknown as R2Bucket;
}

export type FakeKv = KVNamespace & {
  getCallCount: number;
  resetGetCallCount(): void;
};

export function fakeKv(): FakeKv {
  const store = new Map<string, { value: string; metadata: unknown | null }>();
  const kv = {
    getCallCount: 0,
    resetGetCallCount() {
      kv.getCallCount = 0;
    },
    async get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream") {
      kv.getCallCount += 1;
      const entry = store.get(key);
      if (!entry) return null;
      if (type === "json") return JSON.parse(entry.value);
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number; expiration?: number; metadata?: unknown },
    ) {
      store.set(key, {
        value,
        metadata: options?.metadata ?? null,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;
      const names = [...store.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort();
      const start = options?.cursor
        ? names.findIndex((name) => name > options.cursor!)
        : 0;
      const slice = names.slice(Math.max(start, 0), Math.max(start, 0) + limit);
      const listComplete = Math.max(start, 0) + limit >= names.length;
      return {
        keys: slice.map((name) => {
          const entry = store.get(name)!;
          return {
            name,
            metadata: entry.metadata,
          };
        }),
        list_complete: listComplete,
        cursor: listComplete ? undefined : slice[slice.length - 1],
        cacheStatus: null,
      };
    },
    async getWithMetadata(key: string) {
      const entry = store.get(key);
      if (!entry) return { value: null, metadata: null, cacheStatus: null };
      return {
        value: entry.value,
        metadata: entry.metadata,
        cacheStatus: null,
      };
    },
  };
  return kv as unknown as FakeKv;
}

export function fakeFetcher(
  handler: (request: Request) => Response | Promise<Response>,
): Fetcher {
  return {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request =
        input instanceof Request ? input : new Request(input, init);
      return Promise.resolve(handler(request));
    },
    connect() {
      throw new Error("connect not implemented in fakeFetcher");
    },
  } as Fetcher;
}
