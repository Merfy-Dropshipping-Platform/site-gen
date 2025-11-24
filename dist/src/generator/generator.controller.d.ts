import { SiteGeneratorService } from './generator.service';
export declare class GeneratorMicroserviceController {
    private readonly generator;
    private readonly logger;
    constructor(generator: SiteGeneratorService);
    handleBuild(data: any): Promise<{
        buildId: any;
        revisionId: string;
        artifactUrl: string;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
}
