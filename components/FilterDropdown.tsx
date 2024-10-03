import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';

interface FilterDropdownProps {
    activeFilter: string | null;
    isLoggedIn: boolean;
    handleFilterSelect: (filterId: string) => void;
    resetFilteredStations: () => void;
    setSortBy: (sortBy: "name" | "waterLevel") => void;
    setFilterByStatus: (status: string) => void;
    setFilterByFavorite: (isFavorite: boolean) => void;
    setActiveFilter: (filterId: string | null) => void; // Add this line

}


const FilterDropdown: React.FC<FilterDropdownProps> = ({
    activeFilter,
    isLoggedIn,
    handleFilterSelect,
    resetFilteredStations,
    setSortBy,
    setFilterByStatus,
    setFilterByFavorite,
    setActiveFilter
}) => {

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className={`bg-gray-800 text-white border-gray-700 ${activeFilter ? 'bg-blue-600' : ''}`}
                >
                    <Filter className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-gray-800 text-white border-gray-700">
                <DropdownMenuRadioGroup value={activeFilter || ''} onValueChange={handleFilterSelect}>
                    <DropdownMenuRadioItem
                        key="1"
                        value="1"
                        className="cursor-pointer"
                        onClick={() => setSortBy("name")}
                    >
                        Sort by Name
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        key="2"
                        value="2"
                        className="cursor-pointer"
                        onClick={() => setSortBy("waterLevel")}
                    >
                        Sort by Water Level
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        key="3"
                        value="3"
                        className="cursor-pointer"
                        onClick={() => setFilterByStatus("0")}
                    >
                        Filter by Status: Normal
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        key="4"
                        value="4"
                        className="cursor-pointer"
                        onClick={() => setFilterByStatus("1")}
                    >
                        Filter by Status: Alert
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        key="5"
                        value="5"
                        className="cursor-pointer"
                        onClick={() => setFilterByStatus("2")}
                    >
                        Filter by Status: Warning
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                        key="6"
                        value="6"
                        className="cursor-pointer"
                        onClick={() => setFilterByStatus("3")}
                    >
                        Filter by Status: Danger
                    </DropdownMenuRadioItem>
                    {isLoggedIn && (
                        <DropdownMenuRadioItem
                            key="7"
                            value="7"
                            className="cursor-pointer"
                            onClick={() => setFilterByFavorite(true)}
                        >
                            Show Favorites
                        </DropdownMenuRadioItem>
                    )}
                </DropdownMenuRadioGroup>
                <DropdownMenuItem
                    onSelect={() => {
                        setActiveFilter(null);
                        resetFilteredStations();
                    }}
                    className="cursor-pointer border-t border-gray-700 mt-2 pt-2"
                >
                    Clear Filter
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default FilterDropdown;