#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  {
    name: 'json-mcp-server',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

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
  if (request.params.name === 'split') {
    const { fileContent, numObjects } = request.params.arguments as {
      fileContent: string
      numObjects: number
    }

    try {
      const jsonData = JSON.parse(fileContent)
      const keys = Object.keys(jsonData)

      if (numObjects <= 0 || numObjects > keys.length) {
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
  }

  throw new Error(`Unknown tool: ${request.params.name}`)
})

export async function main() {
  try {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('JSON MCP Server running on stdio')
  } catch (error) {
    console.error('Error during startup:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error)
  process.exit(1)
})
