import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import App from './App'
// Import Mantine core styles
import '@mantine/core/styles.css'
// Import FlexLayout styles (Light or Dark)
import 'flexlayout-react/style/dark.css' 
import './flexlayout-overrides.css'

const theme = createTheme({
  /** Put your mantine theme override here */
  primaryColor: 'blue',
  defaultRadius: 'sm',
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
)