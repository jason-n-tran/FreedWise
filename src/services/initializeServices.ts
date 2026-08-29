// Service initialization module

import { getDatabaseManager } from '../database/DatabaseManager';
import { RowMapper } from '../database/rowMapping';
import { BookService } from './BookService';
import { HighlightService } from './HighlightService';
import { FSRSService } from './FSRSService';
import { SearchService } from './SearchService';
import { NotificationService } from './NotificationService';
import { ExtractionService } from './ExtractionService';
import { SettingsService } from './SettingsService';
import { DataService } from './DataService';
import ServiceFactory from './ServiceFactory';

let servicesInitialized = false;

/**
 * Initialize critical services synchronously needed for first render.
 * Non-critical services (notifications) are deferred. (Req 11.1)
 */
export async function initializeServices(): Promise<void> {
  if (servicesInitialized) {
    return;
  }

  try {
    // Initialize database (critical - must complete before UI renders)
    const databaseManager = getDatabaseManager();
    await databaseManager.initialize();

    // Register database manager
    ServiceFactory.getInstance().register('DatabaseManager', databaseManager);

    // Settings service — registered early because the ThemeProvider reads the
    // persisted theme mode before the first screen renders.
    const settingsService = new SettingsService(databaseManager);
    ServiceFactory.getInstance().register('SettingsService', settingsService);

    // Single home for row→model mapping, shared by the services that read rows.
    const rowMapper = new RowMapper(databaseManager);

    // Extraction service is registered up front so BookService can use it; the
    // hidden ExtractionWebView mounts later and registers itself as the backing
    // extractor. Until then, extraction resolves to {} and import falls back.
    const extractionService = new ExtractionService();
    ServiceFactory.getInstance().register('ExtractionService', extractionService);

    // Initialize and register critical services
    const bookService = new BookService(databaseManager, rowMapper, extractionService);
    ServiceFactory.getInstance().register('BookService', bookService);

    const highlightService = new HighlightService(databaseManager, rowMapper);
    ServiceFactory.getInstance().register('HighlightService', highlightService);

    const fsrsService = new FSRSService(databaseManager);
    ServiceFactory.getInstance().register('FSRSService', fsrsService);

    const searchService = new SearchService(databaseManager, rowMapper);
    ServiceFactory.getInstance().register('SearchService', searchService);

    const dataService = new DataService(databaseManager);
    ServiceFactory.getInstance().register('DataService', dataService);

    servicesInitialized = true;
    console.log('Core services initialized successfully');

    // Defer non-critical service initialization until after UI loads (Req 11.1)
    setImmediate(() => {
      const notificationService = new NotificationService(databaseManager, highlightService);
      ServiceFactory.getInstance().register('NotificationService', notificationService);
      console.log('Notification service initialized (deferred)');
    });
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Check if services are initialized
 */
export function areServicesInitialized(): boolean {
  return servicesInitialized;
}
