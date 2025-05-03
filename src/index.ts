#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const SERVER_VERSION = '1.0.1'

const server = new Server(
  {
    name: 'json-mcp-server',
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

const SplitArgumentsSchema = z.object({
  fileContent: z.string(),
  numObjects: z.number().int().positive(),
})

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'split',
        description: 'Split a JSON file into a specified number of objects',
        inputSchema: {
          type: 'object',
          properties: {
            fileContent: {
              type: 'string',
              description: 'The content of the JSON file in string format',
            },
            numObjects: {
              type: 'number',
              description: 'The number of objects to split the JSON into',
            },
          },
          required: ['fileContent', 'numObjects'],
        },
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    if (name === 'split') {
      const { fileContent, numObjects } = SplitArgumentsSchema.parse(args)

      try {
        const jsonData = JSON.parse(fileContent)
        const keys = Object.keys(jsonData)

        if (numObjects > keys.length) {
          throw new Error(
            `Invalid 'numObjects' value. It should be between 1 and the number of top-level keys (${keys.length}).`
          )
        }

        const chunkSize = Math.ceil(keys.length / numObjects)
        const chunks: Record<string, any>[] = []

        for (let i = 0; i < keys.length; i += chunkSize) {
          const chunk = keys.slice(i, i + chunkSize).reduce(
            (acc, key) => {
              acc[key] = jsonData[key]
              return acc
            },
            {} as Record<string, any>
          )
          chunks.push(chunk)
        }

        const splitFiles = chunks.map((chunk, index) => ({
          fileName: `split_part_${index + 1}.json`,
          content: JSON.stringify(chunk, null, 2),
        }))

        return {
          content: [
            {
              type: 'text',
              text: `JSON split successfully into ${numObjects} file(s).`,
            },
            ...splitFiles.map((file) => ({
              type: 'file',
              name: file.fileName,
              content: file.content,
            })),
          ],
        }
      } catch (error: any) {
        throw new Error(`Failed to split JSON file: ${error.message}`)
      }
    } else {
      throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    throw error
  }
})

export async function main() {
  try {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`JSON MCP Server ${SERVER_VERSION} running on stdio`)
  } catch (error) {
    console.error('Error during startup:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error)
  process.exit(1)
})
