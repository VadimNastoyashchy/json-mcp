import fs from 'fs'

export const getAllFileNames = async (
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

export const getAllJsonNames = async (dir: string): Promise<string[]> =>
  getAllFileNames(dir, '.json')

export const getMultipleJsonFilePath = async (
  fileDir: string
): Promise<string[]> => {
  const filePaths: string[] = []
  const fileNames = await getAllJsonNames(fileDir)
  for (let index = 0; index < fileNames.length; index++) {
    filePaths.push(`${fileDir}/${fileNames[index]}`)
  }
  return filePaths
}

export const readFileToJson = async (fileName: string): Promise<any[]> => {
  try {
    const content = await fs.promises.readFile(fileName, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`Error reading or parsing file ${fileName}: ${error}`)
  }
}

export const parseMultipleJson = async (fileDir: string) => {
  const multipleJson: any = []
  const fileNames = await getMultipleJsonFilePath(fileDir)
  for (let index = 0; index < fileNames.length; index++) {
    multipleJson.push(readFileToJson(fileNames[index]))
  }
  return multipleJson
}

export const loadFlatJsons = async (path: string) => {
  const promises = await parseMultipleJson(path)
  if (promises.length === 0) throw new Error(`No files in ${path}`)
  const jsons = await Promise.all(promises)
  return jsons.flat()
}
