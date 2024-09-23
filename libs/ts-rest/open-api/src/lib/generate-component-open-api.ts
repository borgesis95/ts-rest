import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  RouteConfig,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import {
  AppRoute,
  AppRouteResponse,
  AppRouter,
  ContractAnyType,
  ContractNoBody,
  isZodType,
} from '@ts-rest/core';
import { getPathsFromRouter } from './ts-rest-open-api';
import * as yaml from 'js-yaml';
import { writeFileSync } from 'fs';
import { z } from 'zod';
import { RouteParameter } from '@asteasolutions/zod-to-openapi/dist/openapi-registry';
import { OperationObject } from 'openapi3-ts';

extendZodWithOpenApi(z);

const mapMethod = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  DELETE: 'delete',
  PATCH: 'patch',
};
const registry = new OpenAPIRegistry();

export const generateComponentFromContractOpenApi = (
  router: AppRouter,
  options: {
    setOperationId?: boolean | 'concatenated-path';
    jsonQuery?: boolean;
    operationMapper?: (
      operation: OperationObject,
      appRoute: AppRoute,
    ) => OperationObject;
  } = {},
) => {
  const paths = getPathsFromRouter(router);

  const operationIds = new Map<string, string[]>();

  // For each patch i have to register a path...

  const resultPaths = paths.forEach((path) => {
    // --- Check operationId ---
    if (options.setOperationId === true) {
      const existingOp = operationIds.get(path.id);
      if (existingOp) {
        throw new Error(
          `Route '${path.id}' already defined under ${existingOp.join('.')}`,
        );
      }
      operationIds.set(path.id, path.paths);
    }

    // --- End check operationId ---

    const responses = getResponses(path.route.responses);
    const headers = getHeaders(path.route.headers);
    const body = path.route.method !== 'GET' ? path.route.body : null;

    console.log('body', body);

    const routeConfigPath: RouteConfig = {
      method: path.route.method as 'get' | 'post' | 'put' | 'delete' | 'patch',
      request: {
        body: body
          ? {
              content: {
                'application/json': {
                  schema: body as any,
                },
              },
              description: '',
              required: true,
            }
          : undefined,

        query: path.route.query as RouteParameter,
        headers,
        params: path.route.pathParams as RouteParameter,
      },
      ...(options.setOperationId
        ? {
            operationId:
              options.setOperationId === 'concatenated-path'
                ? [...path.paths, path.id].join('.')
                : path.id,
          }
        : {}),
      path: path.path,
      responses,
    };

    registry.registerPath(routeConfigPath);
  });
};
function getOpenApiDocumentation() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'My API test',
      description: 'This is the API',
    },
    servers: [{ url: 'v1' }],
  });
}

export function writeDocumentation() {
  // OpenAPI JSON
  const docs = getOpenApiDocumentation();

  const fileOutputDocument = `./pull-signals_${docs.info.version}_.yaml`;
  writeFileSync(fileOutputDocument, yaml.dump(docs));
}

const getHeaders = (
  headers: ContractAnyType | undefined,
): RouteParameter | undefined => {
  return headers && Object.keys(headers).length === 0
    ? undefined
    : (headers as RouteParameter);
};

const getResponses = (responses: Record<number, AppRouteResponse>) => {
  return Object.entries(responses).reduce(
    (acc, [statusCode, responseSchema]) => {
      const description =
        isZodType(responseSchema) && responseSchema.description
          ? responseSchema.description
          : statusCode;

      return {
        ...acc,
        [statusCode]: {
          description,
          ...(responseSchema
            ? {
                content: {
                  'application/json': {
                    schema: responseSchema,
                  },
                },
              }
            : {}),
        },
      };
    },
    {},
  );
};
