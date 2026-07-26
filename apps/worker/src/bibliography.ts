import { synchronizeVolume, type SynchronizeVolumeCommand } from '@web-comic-library/application';
import {
  createNdlBibliographyProvider,
  createOpenBdBibliographyProvider,
} from '@web-comic-library/connectors';
import { createPostgresBibliography, createPostgresFoundation } from '@web-comic-library/db';

export type BibliographyWorkerHandler = (command: SynchronizeVolumeCommand) => Promise<void>;

export const createBibliographyWorkerHandler = (databaseUrl: string): BibliographyWorkerHandler => {
  const foundation = createPostgresFoundation(databaseUrl);
  const bibliography = createPostgresBibliography(databaseUrl, foundation);
  const openBd = createOpenBdBibliographyProvider();
  const ndl = createNdlBibliographyProvider();

  return async (command) => {
    await synchronizeVolume(foundation, bibliography, openBd, ndl, command);
  };
};
