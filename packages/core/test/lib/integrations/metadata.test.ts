import type { Event } from '@sentry/types';
import { createStackParser, GLOBAL_OBJ, nodeStackLineParser, parseEnvelope } from '@sentry/utils';
import { TextDecoder, TextEncoder } from 'util';

import { createTransport, getCurrentHub, ModuleMetadata } from '../../../src';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const stackParser = createStackParser(nodeStackLineParser());

const stack = new Error().stack || '';

describe('ModuleMetadata integration', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;

    GLOBAL_OBJ._sentryModuleMetadata = GLOBAL_OBJ._sentryModuleMetadata || {};
    GLOBAL_OBJ._sentryModuleMetadata[stack] = { team: 'frontend' };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Adds and removes metadata from stack frames', done => {
    const options = getDefaultTestClientOptions({
      dsn: 'https://username@domain/123',
      enableSend: true,
      stackParser,
      integrations: [new ModuleMetadata()],
      beforeSend: (event, _hint) => {
        // copy the frames since reverse in in-place
        const lastFrame = [...(event.exception?.values?.[0].stacktrace?.frames || [])].reverse()[0];
        // Ensure module_metadata is populated in beforeSend callback
        expect(lastFrame?.module_metadata).toEqual({ team: 'frontend' });
        return event;
      },
      transport: () =>
        createTransport({ recordDroppedEvent: () => undefined, textEncoder: new TextEncoder() }, async req => {
          const [, items] = parseEnvelope(req.body, new TextEncoder(), new TextDecoder());

          expect(items[0][1]).toBeDefined();
          const event = items[0][1] as Event;
          const error = event.exception?.values?.[0];

          // Ensure we're looking at the same error we threw
          expect(error?.value).toEqual('Some error');

          const lastFrame = [...(error?.stacktrace?.frames || [])].reverse()[0];
          // Ensure the last frame is in fact for this file
          expect(lastFrame?.filename).toEqual(__filename);

          // Ensure module_metadata has been stripped from the event
          expect(lastFrame?.module_metadata).toBeUndefined();

          done();
          return {};
        }),
    });

    const client = new TestClient(options);
    const hub = getCurrentHub();
    hub.bindClient(client);
    hub.captureException(new Error('Some error'));
  });
});
