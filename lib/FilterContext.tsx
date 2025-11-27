import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

// Advanced filter options interface (matching AdvancedFilter component)
export interface FilterOptions {
    districts: string[]
    alertLevels: string[]
    sortBy: 'name' | 'waterLevel' | 'lastUpdated' | 'district'
    sortOrder: 'asc' | 'desc'
    showFavoritesOnly: boolean
    showCameraOnly: boolean
    showOfflineStations: boolean
    waterLevelRange: {
        min: number | null
        max: number | null
    }
}

// Default filter state
const DEFAULT_FILTERS: FilterOptions = {
    districts: [],
    alertLevels: [],
    sortBy: 'name',
    sortOrder: 'asc',
    showFavoritesOnly: false,
    showCameraOnly: false,
    showOfflineStations: false, // Hide offline stations by default
    waterLevelRange: { min: 0, max: null } // Set minimum water level to 0 by default
}

interface FilterContextType {
    showFavoritesOnly: boolean;
    toggleFavorites: () => void;
    // Advanced filter state
    advancedFilters: FilterOptions;
    setAdvancedFilters: (filters: FilterOptions) => void;
    updateAdvancedFilters: (filters: Partial<FilterOptions>) => void;
    clearAdvancedFilters: () => void;
    hasActiveAdvancedFilters: boolean;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

// Helper function to load filters from localStorage
const loadFiltersFromStorage = (): FilterOptions => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;

    try {
        const stored = localStorage.getItem('water-level-advanced-filters');
        if (stored) {
            const parsed = JSON.parse(stored);
            // Merge with defaults to handle new fields added later
            return { ...DEFAULT_FILTERS, ...parsed };
        }
    } catch (error) {
        console.warn('Failed to load filters from localStorage:', error);
    }

    return DEFAULT_FILTERS;
};

// Helper function to save filters to localStorage
const saveFiltersToStorage = (filters: FilterOptions) => {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem('water-level-advanced-filters', JSON.stringify(filters));
    } catch (error) {
        console.warn('Failed to save filters to localStorage:', error);
    }
};

export function FilterProvider({
    children
}: {
    children: ReactNode;
}) {
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [advancedFilters, setAdvancedFiltersState] = useState<FilterOptions>(DEFAULT_FILTERS);

    // Load filters from localStorage on mount
    useEffect(() => {
        const storedFilters = loadFiltersFromStorage();
        setAdvancedFiltersState(storedFilters);
    }, []);

    // Save filters to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            saveFiltersToStorage(advancedFilters);
        }
    }, [advancedFilters]);

    const toggleFavorites = () => {
        setShowFavoritesOnly(!showFavoritesOnly);
    };

    const setAdvancedFilters = (filters: FilterOptions) => {
        setAdvancedFiltersState(filters);
    };

    const updateAdvancedFilters = (newFilters: Partial<FilterOptions>) => {
        setAdvancedFiltersState(prev => ({ ...prev, ...newFilters }));
    };

    const clearAdvancedFilters = () => {
        setAdvancedFiltersState(DEFAULT_FILTERS);
    };

    // Check if any advanced filters are active
    const hasActiveAdvancedFilters = (() => {
        const filters = advancedFilters;
        return (
            filters.districts.length > 0 ||
            filters.alertLevels.length > 0 ||
            filters.showFavoritesOnly ||
            filters.showCameraOnly ||
            filters.showOfflineStations !== false || // Changed: false is now default
            (filters.waterLevelRange.min !== null && filters.waterLevelRange.min !== 0) || // Changed: 0 is now default
            filters.waterLevelRange.max !== null ||
            filters.sortBy !== 'name' ||
            filters.sortOrder !== 'asc'
        );
    })();

    return (
        <FilterContext.Provider value={{
            showFavoritesOnly,
            toggleFavorites,
            advancedFilters,
            setAdvancedFilters,
            updateAdvancedFilters,
            clearAdvancedFilters,
            hasActiveAdvancedFilters
        }}>
            {children}
        </FilterContext.Provider>
    );
}

export function useFilter() {
    const context = useContext(FilterContext);
    if (context === undefined) {
        throw new Error('useFilter must be used within a FilterProvider');
    }
    return context;
}

// Export default filters for backward compatibility
export { DEFAULT_FILTERS };