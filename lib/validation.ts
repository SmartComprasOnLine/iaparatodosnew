import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema, ZodError } from 'zod'
import { logger } from './logger'

export function validateRequest<T>(
  schema: ZodSchema<T>,
  handler: (validatedData: T, request: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      let body: unknown

      // Only parse JSON for methods that typically have a body
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          body = await request.json()
        } catch (error) {
          logger.warn('Failed to parse request body as JSON', { error: error instanceof Error ? error.message : String(error) })
          return NextResponse.json(
            { error: 'Invalid JSON in request body', code: 'INVALID_JSON' },
            { status: 400 }
          )
        }
      } else {
        body = {}
      }

      const validatedData = schema.parse(body)

      return await handler(validatedData, request)
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Validation failed', {
          errors: error.errors,
          path: request.nextUrl.pathname,
          method: request.method
        })

        return NextResponse.json(
          {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          },
          { status: 400 }
        )
      }

      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.nextUrl.pathname,
        method: request.method
      })

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }
}

// Helper function for query parameter validation
export function validateQueryParams<T>(
  schema: ZodSchema<T>,
  handler: (validatedData: T, request: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const url = new URL(request.url)
      const queryParams: Record<string, string | string[]> = {}

      for (const [key, value] of url.searchParams.entries()) {
        if (queryParams[key]) {
          if (Array.isArray(queryParams[key])) {
            (queryParams[key] as string[]).push(value)
          } else {
            queryParams[key] = [queryParams[key] as string, value]
          }
        } else {
          queryParams[key] = value
        }
      }

      const validatedData = schema.parse(queryParams)

      return await handler(validatedData, request)
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Query validation failed', {
          errors: error.errors,
          path: request.nextUrl.pathname,
          method: request.method
        })

        return NextResponse.json(
          {
            error: 'Invalid query parameters',
            code: 'INVALID_QUERY_PARAMS',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code,
            }))
          },
          { status: 400 }
        )
      }

      logger.error('Unexpected query validation error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.nextUrl.pathname,
        method: request.method
      })

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }
}
