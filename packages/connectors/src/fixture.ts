const fixtureName = /^[a-z0-9-]+\.(?:html|json|xml)$/;
const fixtureRoot = new URL('../fixtures/', import.meta.url);
const maximumFixtureBytes = 1024 * 1024;

export const readConnectorFixture = async (name: string): Promise<string> => {
  if (!fixtureName.test(name)) {
    throw new Error(`invalid connector fixture name: ${name}`);
  }

  const file = Bun.file(new URL(name, fixtureRoot));

  if (!(await file.exists())) {
    throw new Error(`connector fixture does not exist: ${name}`);
  }

  if (file.size > maximumFixtureBytes) {
    throw new Error(`connector fixture exceeds ${maximumFixtureBytes} bytes: ${name}`);
  }

  return file.text();
};
