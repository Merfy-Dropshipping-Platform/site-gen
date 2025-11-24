export declare class S3StorageService {
    private readonly logger;
    private client;
    private bucketName;
    constructor();
    isEnabled(): Promise<boolean>;
    ensureBucket(): Promise<string>;
    uploadFile(bucket: string, key: string, filePath: string): Promise<string>;
    removePrefix(bucket: string, prefix: string): Promise<{
        readonly removed: number;
    }>;
    removeObject(bucket: string, key: string): Promise<{
        readonly removed: 1;
    }>;
}
