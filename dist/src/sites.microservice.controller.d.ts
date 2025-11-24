import { RmqContext } from '@nestjs/microservices';
import { SitesDomainService } from './sites.service';
export declare class SitesMicroserviceController {
    private readonly service;
    private readonly logger;
    constructor(service: SitesDomainService);
    createSite(data: any, _ctx: RmqContext): Promise<{
        success: boolean;
        siteId: any;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        siteId?: undefined;
    }>;
    getSite(data: any): Promise<{
        success: boolean;
        site: any;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        site?: undefined;
    }>;
    listSites(data: any): Promise<{
        items: any;
        nextCursor: null;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    updateSite(data: any): Promise<{
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    deleteSite(data: any): Promise<{
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    attachDomain(data: any): Promise<{
        id: any;
        challenge: {
            type: string;
            name: string;
            value: string;
        };
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    verifyDomain(data: any): Promise<{
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    publish(data: any): Promise<{
        url: string;
        buildId: any;
        artifactUrl: string;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    freeze(data: any): Promise<{
        affected: any;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    unfreeze(data: any): Promise<{
        affected: any;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    listRevisions(data: any): Promise<{
        items: any;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    createRevision(data: any): Promise<{
        revisionId: `${string}-${string}-${string}-${string}-${string}`;
        success: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
    setCurrentRevision(data: any): Promise<{
        success: true;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
    }>;
}
