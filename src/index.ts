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

  if (name === 'split') {
    const { fileContent, numObjects } = SplitArgumentsSchema.parse(args)

    try {
      const jsonData = JSON.parse(fileContent)

      if (numObjects >= jsonData.length / 2) {
        throw new Error(
          `The number of objects (${numObjects}) per file cannot be half or more of the total (${jsonData}) JSON data length.`
        )
      }

      const totalParts = Math.ceil(jsonData.length / numObjects)

      const chunks = []

      for (let i = 0; i < totalParts; i++) {
        const partArray = jsonData.slice(i * numObjects, (i + 1) * numObjects)

        chunks.push(partArray)
      }

      const splitFiles = chunks.map((chunk, index) => ({
        fileName: `part${index + 1}.json`,
        content: JSON.stringify(chunk, null, 2),
      }))

      return {
        content: [
          {
            type: 'text',
            text: `JSON split successfully into ${splitFiles.length} file(s).`,
          },
          ...splitFiles.map((file) => ({
            type: 'file',
            name: file.fileName,
            content: file.content,
          })),
        ],
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
      }
    }
  } else {
    throw new Error(`Unknown tool: ${name}`)
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
