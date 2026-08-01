import React, {createContext, useContext, useState, useEffect, useCallback, useMemo} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {apiService} from '../api/apiService';

const PortfolioContext = createContext(null);

export const usePortfolio = () => {
    const context = useContext(PortfolioContext);
    if (!context) {
        return {
            portfolios: [],
            activePortfolio: null,
            activePortfolioId: null,
            loading: false,
            switchPortfolio: async () => {},
            refreshPortfolios: async () => {}
        };
    }
    return context;
};

export const PortfolioProvider = ({children}) => {
    const [portfolios, setPortfolios] = useState([]);
    const [activePortfolio, setActivePortfolio] = useState(null);
    const [loading, setLoading] = useState(false);
    const queryClient = useQueryClient();

    const fetchPortfolios = useCallback(async () => {
        setLoading(true);
        try {
            const portfolioList = await apiService.listPortfolios();
            setPortfolios(portfolioList);

            if (portfolioList.length > 0) {
                const storedPortId = localStorage.getItem('active_portfolio_id');
                let selectedPort = portfolioList.find(p => p.id === storedPortId);
                if (!selectedPort) {
                    selectedPort = portfolioList[0];
                }
                localStorage.setItem('active_portfolio_id', selectedPort.id);
                setActivePortfolio(selectedPort);
            } else {
                setActivePortfolio(null);
            }
        } catch (err) {
            console.error('Failed to load portfolios:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPortfolios();
    }, [fetchPortfolios]);

    const switchPortfolio = useCallback(async (portfolioId) => {
        const selectedPort = portfolios.find(p => p.id === portfolioId);
        if (!selectedPort) return;

        setActivePortfolio(selectedPort);
        localStorage.setItem('active_portfolio_id', selectedPort.id);

        queryClient.invalidateQueries({
            queryKey: ["portfolio"]
        });
    }, [portfolios, queryClient]);

    const activePortfolioId = activePortfolio ? activePortfolio.id : null;

    const value = useMemo(() => ({
        portfolios,
        activePortfolio,
        activePortfolioId,
        loading,
        switchPortfolio,
        refreshPortfolios: fetchPortfolios,
    }), [portfolios, activePortfolio, activePortfolioId, loading, switchPortfolio, fetchPortfolios]);

    return (
        <PortfolioContext.Provider value={value}>
            {children}
        </PortfolioContext.Provider>
    );
};
