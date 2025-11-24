export declare class CoolifyProvider {
    private readonly logger;
    private readonly mode;
    private readonly apiUrl;
    private readonly apiPrefix;
    private readonly EP_ENSURE;
    private readonly EP_DEPLOY;
    private readonly EP_SET_DOMAIN;
    private readonly EP_MAINTENANCE;
    private readonly apiToken;
    constructor();
    private http;
    ensureApp(siteId: string): Promise<{
        appId: string;
        envId: string;
    }>;
    deployBuild(params: {
        siteId: string;
        buildId: string;
        artifactUrl: string;
    }): Promise<{
        url: string;
    }>;
    setDomain(siteId: string, domain: string): Promise<{
        readonly success: true;
    }>;
    toggleMaintenance(siteId: string, enabled: boolean): Promise<{
        readonly success: true;
    }>;
}
