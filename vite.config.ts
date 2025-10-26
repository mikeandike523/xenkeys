import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from "vite-plugin-monaco-editor-esm";


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [[
          'babel-plugin-react-compiler'
        ]],
      },
    }),
    monacoEditorPlugin({
      languageWorkers: [], // no syntax highlighting for now
    }),
  ],
})
