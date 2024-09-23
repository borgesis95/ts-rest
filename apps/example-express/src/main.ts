import * as express from 'express';
import { initContract } from '@ts-rest/core';
import { initServer } from '@ts-rest/express';
import { generateOpenApi, getOpenApiDocumentation } from '@ts-rest/open-api';
import * as bodyParser from 'body-parser';
import { serve, setup } from 'swagger-ui-express';
import cors = require('cors');
import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { writeFileSync } from 'fs';

extendZodWithOpenApi(z);

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const s = initServer();

export const SignalType = z
  .enum(['CREATE', 'UPDATE', 'DELETE', 'SEEDUPDATE'])
  .openapi('SignalType');

const SignalSchema = z
  .object({
    signalType: SignalType,
    objectId: z.string(),
    eserviceId: z.string(),
    signalId: z.number(),
    objectType: z.string().optional(),
  })
  .openapi('SignalRequest');

export const SignalPayload = SignalSchema;
export type SignalPayload = z.infer<typeof SignalSchema>;

export const SignalResponse = SignalSchema;
export type SignalResponse = z.infer<typeof SignalSchema>;

export const SignalPushResponse = SignalSchema.pick({ signalId: true }).openapi(
  'SignalPushResponse',
);
export const SignalPullResponse = z.object({
  signals: z.array(SignalResponse),
  lastSignalId: z.number().nullish(),
});

export const Problem = z
  .object({
    type: z.string(),
    status: z.number(),
    title: z.string(),
    correlationId: z.string().nullish(),
    detail: z.string(),
    errors: z.array(
      z.object({
        code: z.string(),
        detail: z.string(),
      }),
    ),
    // toString: z.function(),
  })
  .openapi('Problem');
export type Problem = z.infer<typeof Problem>;

const c = initContract();

export const contract = c.router({
  getStatus: {
    summary: 'Health status endpoint',
    description: 'Should return OK',
    method: 'GET',
    path: '/status',
    responses: {
      200: z.literal('OK'),
    },
  },

  pushSignal: {
    summary: 'Push Signal',
    description: 'Insert a signal',
    headers: z.object({
      authorization: z.string(),
    }),
    metadata: {
      auth: true,
      role: 'user',
    } as const,
    method: 'POST',
    path: '/signals',
    responses: {
      200: SignalPushResponse,
      400: Problem,
      401: Problem,
      403: Problem,
      500: Problem,
    },
    body: SignalPayload,
  },

  pullSignal: {
    summary: 'Get a list of signals',
    description:
      'Retrieve a list o signals on a specific eservice starting from signalId',
    method: 'GET',
    path: '/signals/:eserviceId',
    pathParams: z.object({
      eserviceId: z.string(),
    }),
    headers: z.object({
      authorization: z.string(),
    }),

    query: z.object({
      signalId: z.coerce
        .number()
        .min(0)
        .default(0)
        .openapi({ description: 'signalId from which to search' }),
      size: z.coerce.number().min(1).max(100).optional().default(10).openapi({
        description: 'number of signals to search',
      }),
    }),

    responses: {
      200: SignalPullResponse.openapi('Signal'),
      206: SignalPullResponse,
    },
  },
});

const openapi = generateOpenApi(contract, {
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'A bearer token in the format of a JWS and conformed to the specifications included in [RFC8725](https://tools.ietf.org/html/RFC8725).',
      },
    },
  },
  info: { title: 'Pull-signal', version: '0.1.1' },
});

const fileOutputDocument = `./pull-signals_${openapi.info.version}_.yaml`;
writeFileSync(fileOutputDocument, yaml.dump(openapi));

getOpenApiDocumentation(contract, {
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'A bearer token in the format of a JWS and conformed to the specifications included in [RFC8725](https://tools.ietf.org/html/RFC8725).',
      },
    },
  },

  security: [
    {
      bearerAuth: [],
    },
  ],
  servers: [
    {
      url: '/signals',
      description: 'Pull signal data',
    },
  ],
  info: {
    title: 'Pull signal Service API',
    version: '1.1.0',
    contact: {
      name: 'PagoPA support',
      url: 'https://github.com/pagopa/interop-signalhub-core/issues',
      email: 'Interop-sprint@pagopa.it',
    },
    termsOfService:
      'https://docs.pagopa.it/interoperabilita-1/normativa-e-approfondimenti',
    license: {
      name: 'ISC',
      url: 'https://opensource.org/license/isc-license-txt',
    },
  },
});

const apiDocs = express.Router();

apiDocs.use(serve);
apiDocs.get('/', setup(openapi));

app.use('/api-docs', apiDocs);
app.get('/test', (req, res) => {
  return res.json(req.query);
});

const port = process.env.port || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
server.on('error', console.error);

export default app;
