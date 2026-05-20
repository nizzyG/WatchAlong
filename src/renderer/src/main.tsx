import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { WizardApp } from './WizardApp'
import './styles.css'

const Root = new URLSearchParams(window.location.search).get('view') === 'wizard' ? WizardApp : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
