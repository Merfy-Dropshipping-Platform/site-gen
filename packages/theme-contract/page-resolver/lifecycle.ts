// backend/services/sites/packages/theme-contract/page-resolver/lifecycle.ts

export type LifecycleEvent =
  | { type: 'siteCreate'; siteId: string; revisionId: string }
  | { type: 'pageLoad'; pageId: string }
  | { type: 'pageSwitch'; from: string; to: string }
  | { type: 'contentChange'; pageId: string; diffSize: number }
  | { type: 'pageCreate'; pageId: string }
  | { type: 'pageDelete'; pageId: string }
  | { type: 'publish'; siteId: string; buildId: string };

export type LifecycleHandler = (event: LifecycleEvent) => void | Promise<void>;

export class LifecycleBus {
  private handlers: LifecycleHandler[] = [];

  subscribe(handler: LifecycleHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  async emit(event: LifecycleEvent): Promise<void> {
    await Promise.allSettled(this.handlers.map((h) => h(event)));
  }
}
