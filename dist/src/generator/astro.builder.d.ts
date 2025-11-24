export interface AstroBuildParams {
    workingDir: string;
    outDir: string;
    data: any;
    outFileName?: string;
}
export declare function buildWithAstro(params: AstroBuildParams): Promise<{
    ok: boolean;
    artifactPath?: string;
    error?: string;
}>;
