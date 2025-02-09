/// <reference lib="bun" />

declare module '*.html' {
  const contents: string
  export default contents
}
