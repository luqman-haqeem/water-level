import React, { createContext, useContext, ReactNode, useState } from 'react';

interface FilterContextType {
  showFavoritesOnly: boolean;
  toggleFavorites: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ 
  children
}: {
  children: ReactNode;
}) {
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  const toggleFavorites = () => {
    setShowFavoritesOnly(!showFavoritesOnly);
  };

  return (
    <FilterContext.Provider value={{ 
      showFavoritesOnly,
      toggleFavorites
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