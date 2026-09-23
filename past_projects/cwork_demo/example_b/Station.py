#######################################
# GROUP A Skill : Complex OOP model   #
#######################################

from Location import Location

class Station(Location):
    """
    A class to represent a station in the MRT network.
    
    Attributes
    ----------
    station_code : str
        The station code.
    station_name : str
        The station name.
    line_colour : str
        The line colour.
    line_name : str 
        The line name.
    lat : float     
        The latitude of the station.
    lng : float
        The longitude of the station.
    adjacent_stations : list[str]   
        The list of adjacent stations.
    connections : dict[str, str]    
        The dictionary of connections.

    Methods
    -------
    validate_data()
        Validate the data.
    get_adjacent_stations() -> list[str]    
        Get the list of adjacent stations.
    set_adjacent_stations(adjacent_stations: list[str]) 
        Set the list of adjacent stations.
    get_connections() -> dict[str, str]
        Get the dictionary of connections.
    set_connections(connections: dict[str, str])
        Set the dictionary of connections.
    get_station_code() -> str   
        Get the station code.
    get_station_name() -> str   
        Get the station name.
    get_line_color() -> str 
        Get the line colour.
    get_line_name() -> str  
        Get the line name.
    get_connection(station_code: str) -> str    
        Get the connection.
    get_lng() -> float  
        Get the longitude.
    get_lat() -> float
        Get the latitude.
    add_connection(station_code: str, connection_info: str) 
        Add a connection.
    remove_connection(station_code: str)    
        Remove a connection.
    
    """
    def __init__(self, station_code: str, station_name: str, line_colour: str, line_name: str, lat: float, lng: float, adjacent_stations: list[str]):
        """ 
        Constructs all the necessary attributes for the station object.
    
        Parameters
        ----------
        station_code : str
            The station code.
        station_name : str
            The station name.
        line_colour : str   
            The line colour.
        line_name : str
            The line name.
        lat : float
            The latitude of the station.
        lng : float
            The longitude of the station.
        adjacent_stations : list[str]   
            The list of adjacent stations
        
        """
        super().__init__(lat, lng)
        self.__station_code = station_code
        self.__station_name = station_name
        self.__line_colour = line_colour
        self.__line_name = line_name
        self.__lat = lat
        self.__lng = lng
        self.__adjacent_stations = adjacent_stations
        self.__connections = {}
        self.validate_data()

    def __str__(self) -> str:
        """
        Returns the string representation of the station object.
        """
        return f"{self.__station_code}, {self.__station_name}, {self.__line_colour}, {self.__line_name}, {self.lat}, {self.lng}, {self.__adjacent_stations}, {self.__connections}"

    def validate_data(self):
        """
        Validate the data.
        """
        if not self.__station_code or not isinstance(self.__station_code, str):
            raise ValueError("Invalid station code")
        if not self.__station_name or not isinstance(self.__station_name, str):
            raise ValueError("Invalid station name")

    def get_adjacent_stations(self) -> list[str]:
        """ 
        Get the list of adjacent stations.
        
            Returns
            -------
            list[str]
                The list of adjacent stations.
        """
        return self.__adjacent_stations

    def set_adjacent_stations(self, adjacent_stations: list[str]):
        """
        Set the list of adjacent stations
            
            Parameters
            ----------
            adjacent_stations : list[str]
                The list of adjacent stations.

            """
        self.__adjacent_stations = adjacent_stations

    def get_connections(self) -> dict[str, str]:
        """
        Get the dictionary of connections.
                
            Returns
            -------
                dict[str, str]
                The dictionary of connections.
                    
        """
        return self.__connections

    def set_connections(self, connections: dict[str, str]):
        """
        Set the dictionary of connections.
            
            Parameters
            ----------
                connections : dict[str, str]
                The dictionary of connections.
                    
        """
        self.__connections = connections

    def get_station_code(self) -> str:
        """
        Get the station code.
        
            Returns
            -------
                str
                The station code.

        """
        return self.__station_code

    def get_station_name(self) -> str:
        """
        Get the station name.
        
            Returns
            -------
                str
                The station name.
        """
        return self.__station_name

    def get_line_color(self) -> str:
        """
        Get the line colour.
        
            Returns
            -------
                str
                The line colour. 
        """
        return self.__line_colour

    def get_line_name(self) -> str:
        """
        Get the line name.

            Returns
            -------
                str
                The line name.
        """
        return self.__line_name

    def get_connection(self, station_code: str) -> str:
        """ 
        Get the connection.
        
            Parameters
            ----------
                station_code : str
                The station code.
            
            Returns
            -------
                str
                The connection.
        """
        return self.__connections.get(station_code)
    
    def get_lng(self) -> float:
        """
        Get the longitude.
        
            Returns
            -------
                float
                The longitude.
        """
        return self.__lng
    
    def get_lat(self) -> float:
        """
        Get the latitude.
        
            Returns
            -------
                float
                The latitude.
        """
        #return self.lat
        return self.__lat

    def add_connection(self, station_code: str, connection_info: str):
        """
        Add a connection.
        
            Parameters
            ----------
                station_code : str
                The station code.
                connection_info : str
                The connection information.
        """

        if station_code not in self.__connections:
            self.__connections[station_code] = connection_info
        else:
            raise ValueError("Connection already exists")

    def remove_connection(self, station_code: str):
        """
        Remove a connection.
        
            Parameters
            ----------
                station_code : str
                The station code.
    """
        if station_code in self.__connections:
            del self.__connections[station_code]
        else:
            raise ValueError("Connection does not exist")