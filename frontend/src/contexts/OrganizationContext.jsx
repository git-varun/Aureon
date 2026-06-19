import React, {createContext, useContext, useState, useEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {apiService} from '../api/apiService';
import {useAuth} from './AuthContext';

const OrganizationContext = createContext(null);

export const useOrganization = () => {
    const context = useContext(OrganizationContext);
    if (!context) {
        return {
            organizations: [],
            activeOrg: null,
            activeOrgId: null,
            membershipRole: null,
            loading: false,
            switchOrganization: async () => {},
            refreshOrganizations: async () => {}
        };
    }
    return context;
};

export const OrganizationProvider = ({children}) => {
    const {user, isAuthenticated} = useAuth();
    const [organizations, setOrganizations] = useState([]);
    const [activeOrg, setActiveOrg] = useState(null);
    const [membershipRole, setMembershipRole] = useState(null);
    const [loading, setLoading] = useState(false);
    const queryClient = useQueryClient();

    const fetchOrgsAndRole = async () => {
        if (!isAuthenticated || !user) {
            setOrganizations([]);
            setActiveOrg(null);
            setMembershipRole(null);
            return;
        }
        setLoading(true);
        try {
            const orgList = await apiService.listOrganizations();
            setOrganizations(orgList);
            
            if (orgList.length > 0) {
                const storedOrgId = localStorage.getItem('active_org_id');
                let selectedOrg = orgList.find(o => o.id === storedOrgId);
                if (!selectedOrg) {
                    selectedOrg = orgList[0];
                }
                setActiveOrg(selectedOrg);
                localStorage.setItem('active_org_id', selectedOrg.id);

                // Fetch role in the active org
                try {
                    const members = await apiService.listMembers(selectedOrg.id);
                    const currentMember = members.find(m => m.user_id === user.id);
                    setMembershipRole(currentMember ? currentMember.role : 'MEMBER');
                } catch (roleErr) {
                    console.warn('Failed to load members role:', roleErr);
                    setMembershipRole('MEMBER');
                }
            } else {
                setActiveOrg(null);
                setMembershipRole(null);
            }
        } catch (err) {
            console.error('Failed to load organizations:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrgsAndRole();
    }, [isAuthenticated, user]);

    const switchOrganization = async (orgId) => {
        const selectedOrg = organizations.find(o => o.id === orgId);
        if (!selectedOrg) return;

        setLoading(true);
        try {
            // Invalidate/clear query cache to prevent cross-tenant cache leak
            queryClient.clear();

            setActiveOrg(selectedOrg);
            localStorage.setItem('active_org_id', selectedOrg.id);

            // Fetch role in the new org
            const members = await apiService.listMembers(selectedOrg.id);
            const currentMember = members.find(m => m.user_id === user?.id);
            setMembershipRole(currentMember ? currentMember.role : 'MEMBER');
        } catch (err) {
            console.error('Failed to switch organization:', err);
        } finally {
            setLoading(false);
        }
    };

    const activeOrgId = activeOrg ? activeOrg.id : null;

    return (
        <OrganizationContext.Provider value={{
            organizations,
            activeOrg,
            activeOrgId,
            membershipRole,
            loading,
            switchOrganization,
            refreshOrganizations: fetchOrgsAndRole
        }}>
            {children}
        </OrganizationContext.Provider>
    );
};
