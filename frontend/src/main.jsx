import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'

import {AuthProvider} from './contexts/AuthContext'
import {OrganizationProvider} from './contexts/OrganizationContext'
import {PortfolioProvider} from './contexts/PortfolioContext'

const queryClient = new QueryClient({
    defaultOptions: {queries: {staleTime: 60_000, retry: 1}},
});

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <OrganizationProvider>
                        <PortfolioProvider>
                            <App/>
                        </PortfolioProvider>
                    </OrganizationProvider>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
)

