#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { zodToJsonSchema } from 'zod-to-json-schema'
import fs from 'fs'
import _path from 'path'
import os from 'os'

const ToolInputSchema = ToolSchema.shape.inputSchema
type ToolInput = z.infer<typeof ToolInputSchema>

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
)
const SERVER_VERSION = packageJson.version

// Server setup
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

// Schema definitions
const PathArgSchema = z.object({
  path: z.string(),
})

const SplitFileArgSchema = z.object({
  path: z.string(),
  numObjects: z.number().int().positive(),
})

// Function implementation
const expandHome = (filepath: string) => {
  if (filepath.startsWith('~/') || filepath === '~') {
    return _path.join(os.homedir(), filepath.slice(1))
  }
  return filepath
}

const validatePath = async (requestedPath: string): Promise<string> => {
  const expandedPath = expandHome(requestedPath)
  const absolute = _path.isAbsolute(expandedPath)
    ? _path.resolve(expandedPath)
    : _path.resolve(process.cwd(), expandedPath)

  try {
    const realPath = await fs.promises.realpath(absolute)
    return realPath
  } catch (error) {
    const parentDir = _path.dirname(absolute)
    try {
      return absolute
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`)
    }
  }
}

const getParentDir = async (requestedPath: string): Promise<string> => {
  const expandedPath = expandHome(requestedPath)
  const absolute = _path.isAbsolute(expandedPath)
    ? _path.resolve(expandedPath)
    : _path.resolve(process.cwd(), expandedPath)

  try {
    const parentDir = _path.dirname(absolute)
    return parentDir
  } catch (error) {
    throw new Error('Parent directory does not exist')
  }
}

const getAllFileNames = async (
  dir: string,
  extension: string
): Promise<string[]> => {
  try {
    const filenames = await fs.promises.readdir(dir)
    return filenames.filter((fn: string) => fn.endsWith(extension))
  } catch (error) {
    throw new Error(`No such folder ${dir}`)
  }
}

const getAllJsonNames = async (dir: string): Promise<string[]> =>
  getAllFileNames(dir, '.json')

const getMultipleJsonFilePath = async (fileDir: string): Promise<string[]> => {
  const filePaths: string[] = []
  const fileNames = await getAllJsonNames(fileDir)
  for (let index = 0; index < fileNames.length; index++) {
    filePaths.push(`${fileDir}/${fileNames[index]}`)
  }
  return filePaths
}

const readFileToJson = async (fileName: string): Promise<any[]> => {
  try {
    const content = await fs.promises.readFile(fileName, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Error reading or parsing file ${fileName}: ${error}`)
  }
}

const parseMultipleJson = async (fileDir: string) => {
  const multipleJson: any = []
  const fileNames = await getMultipleJsonFilePath(fileDir)
  for (let index = 0; index < fileNames.length; index++) {
    multipleJson.push(readFileToJson(fileNames[index]))
  }
  return multipleJson
}

const loadFlatJsons = async (path: string) => {
  const promises = await parseMultipleJson(path)
  if (promises.length === 0) throw new Error(`No files in ${path}`)
  const jsons = await Promise.all(promises)
  return jsons.flat()
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'split',
        description: 'Split a JSON file into a specified number of objects',
        inputSchema: zodToJsonSchema(SplitFileArgSchema) as ToolInput,
      },
      {
        name: 'merge',
        description: 'Merge JSON files into a one JSON file',
        inputSchema: zodToJsonSchema(PathArgSchema) as ToolInput,
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params

    switch (name) {
      case 'split': {
        const parsed = SplitFileArgSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for split: ${parsed.error}`)
        }
        const { path, numObjects } = parsed.data

        const validPath = await validatePath(path)
        const content = await fs.promises.readFile(validPath, 'utf-8')
        const folder = await getParentDir(path)

        const jsonData = JSON.parse(content)

        if (numObjects >= jsonData.length / 2) {
          throw new Error(
            `The number of objects (${numObjects}) per file cannot be half or more of the total (${jsonData.length}) JSON data length.`
          )
        }

        const totalParts = Math.ceil(jsonData.length / numObjects)

        await Promise.all(
          Array.from({ length: totalParts }, async (_, i) => {
            const partArray = jsonData
              .slice(i * numObjects, (i + 1) * numObjects)
              ?.flat()
            const partFileName = _path.join(folder, `part${i + 1}.json`)
            try {
              await fs.promises.writeFile(
                partFileName,
                JSON.stringify(partArray, null, 2)
              )
              console.log(`Successfully wrote ${partFileName}`)
            } catch (err) {
              console.error(`Error writing file ${partFileName}:`, err)
            }
          })
        )

        return {
          content: [
            {
              type: 'text',
              text: `Successfully splitted to ${parsed.data.path}`,
            },
          ],
        }
      }

      case 'merge': {
        const parsed = PathArgSchema.safeParse(args)
        if (!parsed.success) {
          throw new Error(`Invalid arguments for merge: ${parsed.error}`)
        }
        const { path } = parsed.data

        const validPath = await validatePath(path)
        const content = await loadFlatJsons(validPath)
        const fileName = _path.join(validPath, 'merged.json')

        try {
          await fs.promises.writeFile(
            fileName,
            JSON.stringify(content, null, 2)
          )
          console.log(`Successfully wrote ${fileName}`)
        } catch (err) {
          console.error(`Error writing file ${fileName}:`, err)
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully merged to ${fileName}`,
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
})

// Start server
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
