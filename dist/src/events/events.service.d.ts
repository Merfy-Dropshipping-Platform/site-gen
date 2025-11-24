import { ClientProxy } from '@nestjs/microservices';
export declare class SitesEventsService {
    private readonly client;
    constructor(client: ClientProxy);
    emit(pattern: string, payload: any): void;
}
