import React, {createContext, useContext, useState, useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {apiService} from '../api/apiService';
import {useOrganization} from './OrganizationContext';

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
    const {activeOrgId} = useOrganization();
    const [portfolios, setPortfolios] = useState([]);
    const [activePortfolio, setActivePortfolio] = useState(null);
    const [loading, setLoading] = useState(false);
    const queryClient = useQueryClient();

    const fetchPortfolios = async () => {
        if (!activeOrgId) {
            setPortfolios([]);
            setActivePortfolio(null);
            return;
        }
        setLoading(true);
        try {
            const portfolioList = await apiService.listPortfolios(activeOrgId);
            setPortfolios(portfolioList);

            if (portfolioList.length > 0) {
                const storedPortId = localStorage.getItem(`active_portfolio_id_${activeOrgId}`);
                let selectedPort = portfolioList.find(p => p.id === storedPortId);
                if (!selectedPort) {
                    selectedPort = portfolioList[0];
                }
                setActivePortfolio(selectedOrg => {
                    localStorage.setItem(`active_portfolio_id_${activeOrgId}`, selectedPort.id);
                    return selectedPort;
                });
            } else {
                setActivePortfolio(null);
            }
        } catch (err) {
            console.error('Failed to load portfolios:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPortfolios();
    }, [activeOrgId]);

    const switchPortfolio = async (portfolioId) => {
        const selectedPort = portfolios.find(p => p.id === portfolioId);
        if (!selectedPort) return;

        setActivePortfolio(selectedPort);
        localStorage.setItem(`active_portfolio_id_${activeOrgId}`, selectedPort.id);

        // Invalidate queries under the active tenant / portfolio structure
        queryClient.invalidateQueries({
            queryKey: [activeOrgId, portfolioId]
        });
    };

    const activePortfolioId = activePortfolio ? activePortfolio.id : null;

    return (
        <PortfolioContext.Provider value={{
            portfolios,
            activePortfolio,
            activePortfolioId,
            loading,
            switchPortfolio,
            refreshPortfolios: fetchPortfolios
        }}>
            {children}
        </PortfolioContext.Provider>
    );
};
