interface PaginatedResponse<T> {
  data: T;
  metadata: {
    totalPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
    totalItems: number;
  };
}

export class PaginationService {
  private static readonly DEFAULT_PAGE_SIZE = 1000000; // 1MB in characters

  static paginate<T>(data: T, page: number = 1, pageSize: number = this.DEFAULT_PAGE_SIZE): PaginatedResponse<T> {
    const serializedData = JSON.stringify(data);
    const totalItems = serializedData.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Validate page number
    if (page < 1 || page > totalPages) {
      throw new Error(`Invalid page number. Available pages: 1-${totalPages}`);
    }

    // Calculate slice indices
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);

    // Slice the data
    const paginatedJson = serializedData.slice(startIndex, endIndex);
    let paginatedData: T;

    try {
      // Handle partial JSON at page boundaries
      if (page === 1) {
        // For first page, parse normally
        paginatedData = JSON.parse(paginatedJson);
      } else {
        // For subsequent pages, wrap in array to make it valid JSON
        const wrappedJson = `[${paginatedJson}]`;
        const parsed = JSON.parse(wrappedJson);
        paginatedData = parsed[0] as T;
      }
    } catch (error) {
      throw new Error(`Error parsing paginated data: ${error}`);
    }

    return {
      data: paginatedData,
      metadata: {
        totalPages,
        currentPage: page,
        pageSize,
        hasNextPage: page < totalPages,
        totalItems
      }
    };
  }

  static async streamResponse<T>(
    data: T,
    onChunk: (chunk: string) => Promise<void>,
    chunkSize: number = this.DEFAULT_PAGE_SIZE
  ): Promise<void> {
    const serializedData = JSON.stringify(data);
    const totalChunks = Math.ceil(serializedData.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, serializedData.length);
      const chunk = serializedData.slice(start, end);
      await onChunk(chunk);
    }
  }
}
