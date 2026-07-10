import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import App from './App'
import { appTheme } from './utils/uiTokens'
// Import Mantine core styles
import '@mantine/core/styles.css'
// Import FlexLayout styles (Light or Dark)
import 'flexlayout-react/style/dark.css' 
import './flexlayout-overrides.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
)
