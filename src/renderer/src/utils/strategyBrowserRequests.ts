import type { ApiResponse, Strategy } from './strategyConstants';
import { hasSameStrategyDetailVersion, mergeRefreshedStrategyPage } from './strategyRefresh';
import {
  fetchRetrospectiveBoard, fetchRetrospectiveCatalog, fetchRetrospectiveStrategy,
  type RetrospectiveBoardResponse, type RetrospectiveSnapshot,
} from './retrospectiveApi';

// These controllers own the actual production fetch paths, not just cancellation
// flags. Every continuation checks its lifetime, even when fetch/JSON ignores abort.
class ObservableState<T> {
  private listeners = new Set<() => void>();
  constructor(protected state: T) {}
  getSnapshot = (): T => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  protected update(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export const STRATEGY_PAGE_SIZE = 20;
export interface LiveBrowserState {
  query: string | null;
  strategies: Strategy[];
  total: number;
  offset: number;
  loading: boolean;
  listError: string | null;
  detailError: string | null;
  expandedId: string | null;
  detailLoadingId: string | null;
}
export const EMPTY_LIVE_BROWSER: LiveBrowserState = {
  query: null, strategies: [], total: 0, offset: 0, loading: false,
  listError: null, detailError: null, expandedId: null, detailLoadingId: null,
};

const message = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

export class LiveBrowserRequests extends ObservableState<LiveBrowserState> {
  private lifetime = 0;
  private pageAttempt = 0;
  private detailAttempt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private fetcher: typeof fetch = fetch) { super(EMPTY_LIVE_BROWSER); }

  // query is the complete first-page URL. Its serialized server parameters are
  // also the render identity: old rows never appear beneath new filter labels.
  activate(query: string): void {
    this.deactivate();
    this.update({ ...EMPTY_LIVE_BROWSER, query });
    void this.refresh();
    this.timer = setInterval(() => {
      if (!this.state.loading && this.state.offset === 0) void this.refresh();
    }, 5 * 60_000);
  }

  deactivate(): void {
    this.lifetime += 1;
    this.pageAttempt += 1;
    this.detailAttempt += 1;
    clearInterval(this.timer);
    this.timer = undefined;
    this.update({ ...EMPTY_LIVE_BROWSER });
  }

  refresh = (): Promise<void> => this.loadPage(0);
  loadMore = (): Promise<void> => {
    if (this.state.loading || this.state.offset + STRATEGY_PAGE_SIZE >= this.state.total) return Promise.resolve();
    return this.loadPage(this.state.offset + STRATEGY_PAGE_SIZE);
  };

  private async json<T>(url: string): Promise<T> {
    // Native Window.fetch rejects the controller as its receiver.
    const fetcher = this.fetcher;
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async loadPage(offset: number): Promise<void> {
    const query = this.state.query;
    if (!query) return;
    const lifetime = this.lifetime;
    const attempt = ++this.pageAttempt;
    const owns = () => lifetime === this.lifetime && attempt === this.pageAttempt;
    if (offset === 0) {
      this.detailAttempt += 1;
      this.update({ detailLoadingId: null, detailError: null });
    }
    this.update({ loading: true, listError: null });
    try {
      const url = new URL(query);
      url.searchParams.set('offset', String(offset));
      const data = await this.json<ApiResponse>(url.toString());
      if (!owns()) return;
      let strategies: Strategy[];
      if (offset === 0) {
        this.detailAttempt += 1;
        strategies = mergeRefreshedStrategyPage(this.state.strategies, data.strategies);
      } else {
        const existing = new Set(this.state.strategies.map((row) => row.id));
        strategies = [...this.state.strategies, ...data.strategies.filter((row) => !existing.has(row.id))];
      }
      const expandedId = strategies.some((row) => row.id === this.state.expandedId) ? this.state.expandedId : null;
      this.update({ strategies, total: data.total, offset, expandedId,
        ...(offset === 0 ? { detailLoadingId: null, detailError: null } : {}) });
      if (offset === 0 && expandedId) void this.loadDetail(expandedId);
    } catch (error) {
      if (owns()) this.update({ listError: message(error, 'Could not reach the strategy server.') });
    } finally {
      if (owns()) this.update({ loading: false });
    }
  }

  expand(id: string | null): void {
    this.detailAttempt += 1;
    const expandedId = this.state.strategies.some((row) => row.id === id) ? id : null;
    this.update({ expandedId, detailLoadingId: null, detailError: null });
    if (expandedId) void this.loadDetail(expandedId);
  }

  private async loadDetail(id: string): Promise<void> {
    const summary = this.state.strategies.find((row) => row.id === id);
    if (!summary || summary.raw_export || !this.state.query) return;
    const lifetime = this.lifetime;
    const attempt = ++this.detailAttempt;
    const owns = () => lifetime === this.lifetime && attempt === this.detailAttempt
      && this.state.expandedId === id;
    this.update({ detailLoadingId: id, detailError: null });
    try {
      const url = new URL(this.state.query);
      url.pathname = `${url.pathname}/${encodeURIComponent(id)}`;
      url.search = '';
      const detail = await this.json<Strategy>(url.toString());
      if (!owns()) return;
      const current = this.state.strategies.find((row) => row.id === id);
      if (!current || !hasSameStrategyDetailVersion(current, summary)) return;
      if (detail.id !== id || !hasSameStrategyDetailVersion(summary, detail)) {
        throw new Error('The strategy changed while its details loaded. Refresh to try again.');
      }
      // Detail provides the omitted fields; the current list remains authoritative
      // for its metrics/votes, which may have advanced without a detail revision.
      this.update({ strategies: this.state.strategies.map((row) => row.id === id
        ? { ...detail, ...row, raw_export: detail.raw_export } : row) });
    } catch (error) {
      if (owns()) this.update({ detailError: `Could not load full strategy details: ${message(error, 'Request failed.')}` });
    } finally {
      if (owns()) this.update({ detailLoadingId: null });
    }
  }
}

export interface SnapshotBoards {
  rated: RetrospectiveBoardResponse;
  profit: RetrospectiveBoardResponse;
}
export interface FrozenBrowserState {
  snapshots: RetrospectiveSnapshot[];
  boards: Record<string, SnapshotBoards>;
  loading: boolean;
  listError: string | null;
  actionError: string | null;
  loadingStrategyKey: string | null;
}
export const frozenStrategyKey = (league: string, id: string): string => JSON.stringify([league, id]);
const emptyFrozen = (): FrozenBrowserState => ({
  snapshots: [], boards: {}, loading: true, listError: null, actionError: null, loadingStrategyKey: null,
});

export class FrozenBrowserRequests extends ObservableState<FrozenBrowserState> {
  private active = false;
  private generation = 0;
  private action = 0;
  constructor(private fetcher: typeof fetch = fetch) { super(emptyFrozen()); }
  activate(): void {
    this.active = true;
    void this.refresh();
  }
  deactivate(): void {
    this.active = false;
    this.generation += 1;
    this.action += 1;
    this.update(emptyFrozen());
  }
  refresh = async (): Promise<void> => {
    if (!this.active) return;
    const generation = ++this.generation;
    this.action += 1;
    const owns = () => this.active && generation === this.generation;
    this.update({ loading: true, listError: null, actionError: null, loadingStrategyKey: null });
    try {
      const catalog = await fetchRetrospectiveCatalog(this.fetcher);
      if (!owns()) return;
      const entries = await Promise.all(catalog.retrospectives.map(async (snapshot) => {
        const [rated, profit] = await Promise.all([
          fetchRetrospectiveBoard(snapshot.league_key, 'score', this.fetcher),
          fetchRetrospectiveBoard(snapshot.league_key, 'div_per_map', this.fetcher),
        ]);
        return [snapshot.league_key, { rated, profit }] as const;
      }));
      if (!owns()) return;
      this.action += 1;
      this.update({ snapshots: catalog.retrospectives, boards: Object.fromEntries(entries),
        loadingStrategyKey: null, actionError: null });
    } catch (error) {
      if (owns()) this.update({ listError: message(error, 'Could not load public snapshots.') });
    } finally {
      if (owns()) this.update({ loading: false });
    }
  };
  load = async (league: string, id: string, onLoad: (strategy: Strategy) => void): Promise<void> => {
    if (!this.active) return;
    const generation = this.generation;
    const action = ++this.action;
    const owns = () => this.active && generation === this.generation && action === this.action;
    this.update({ loadingStrategyKey: frozenStrategyKey(league, id), actionError: null });
    try {
      const detail = await fetchRetrospectiveStrategy(league, id, this.fetcher);
      if (!owns()) return;
      if (detail.strategy.id !== id || detail.retrospective.league_key !== league) {
        throw new Error('The frozen strategy did not match the selected snapshot.');
      }
      onLoad(detail.strategy);
    } catch (error) {
      if (owns()) this.update({ actionError: message(error, 'Could not load this frozen strategy.') });
    } finally {
      if (owns()) this.update({ loadingStrategyKey: null });
    }
  };
}
