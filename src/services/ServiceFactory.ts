// Service Factory for Dependency Injection

import type {
  IBookService,
  IHighlightService,
  IFSRSService,
  INotificationService,
  ISearchService,
  IExtractionService,
  ISettingsService,
  IDataService,
} from './interfaces';
import type { IDatabaseManager } from '../database';

/**
 * ServiceFactory provides centralized service instantiation and dependency injection.
 * This allows for easy testing by swapping implementations and ensures single instances.
 */
class ServiceFactory {
  private static instance: ServiceFactory;
  private services: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  /**
   * Register a service instance
   */
  register<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  /**
   * Get a registered service
   */
  get<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service not found: ${key}`);
    }
    return service as T;
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * Clear all services (useful for testing)
   */
  clear(): void {
    this.services.clear();
  }

  // Convenience getters for typed service access
  getDatabaseManager(): IDatabaseManager {
    return this.get<IDatabaseManager>('DatabaseManager');
  }

  getBookService(): IBookService {
    return this.get<IBookService>('BookService');
  }

  getHighlightService(): IHighlightService {
    return this.get<IHighlightService>('HighlightService');
  }

  getFSRSService(): IFSRSService {
    return this.get<IFSRSService>('FSRSService');
  }

  getNotificationService(): INotificationService {
    return this.get<INotificationService>('NotificationService');
  }

  getSearchService(): ISearchService {
    return this.get<ISearchService>('SearchService');
  }

  getExtractionService(): IExtractionService {
    return this.get<IExtractionService>('ExtractionService');
  }

  getSettingsService(): ISettingsService {
    return this.get<ISettingsService>('SettingsService');
  }

  getDataService(): IDataService {
    return this.get<IDataService>('DataService');
  }
}

export default ServiceFactory;
