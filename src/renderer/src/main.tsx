import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MovieWindowApp } from './MovieWindowApp'
import { WizardApp } from './WizardApp'
import './styles.css'

const view = new URLSearchParams(window.location.search).get('view')
const Root = view === 'wizard' ? WizardApp : view === 'movie' ? MovieWindowApp : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
