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

export function fakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream") {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      return value;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true, cacheStatus: null };
    },
    async getWithMetadata() {
      return { value: null, metadata: null, cacheStatus: null };
    },
  } as unknown as KVNamespace;
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
