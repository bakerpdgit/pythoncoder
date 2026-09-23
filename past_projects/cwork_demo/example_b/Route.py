##########################
# GROUP A Skill : OOP    #
##########################
from Location import Location

class Route():

    """
    A class to represent a route in the MRT network.

    Attributes
    ----------  
    start_station : str
        The starting station.
    dest_station : str
        The destination station.
    distance : float
        The distance between the two stations.
    travel_time : float
        The travel time between the two stations.
    path_codes : str
        The path codes.
    path_names : str
        The path names.
    user_id : int
        The user id.

    Methods
    -------
    get_start_station() -> str
        Get the starting station.
    get_dest_station() -> str
        Get the destination station.
    get_distance() -> float
        Get the distance between the two stations.
    get_travel_time() -> float
        Get the travel time between the two stations.
    get_path_codes() -> str
        Get the path codes.
    get_path_names() -> str
        Get the path names.
    get_user_id() -> int
        Get the user id.
         
    """
    def __init__(self, start_station: str, dest_station: str, distance: float, travel_time: float, path_codes: str, path_names: str, user_id: int):
        """
        Constructs all the necessary attributes for the Route object.
        
        Parameters
        ----------
        start_station : str
            The starting station.
        dest_station : str
            The destination station.
        distance : float
            The distance between the two stations.
        travel_time : float
            The travel time between the two stations.
        path_codes : str
            The path codes.
        path_names : str
            The path names.
        user_id : int
            The user id.
    """
        self.__start_station = start_station
        self.__dest_station = dest_station
        self.__distance = distance
        self.__travel_time = travel_time
        self.__path_codes = path_codes
        self.__path_names = path_names
        self.__user_id = user_id

    def __str__(self) -> str:
        """
        Returns the string representation of the Route object.
        """
        return f"{self.__start_station}, {self.__dest_station}, {self.__distance}, {self.__travel_time}, {self.__path_codes}, {self.__path_names}, {self.__user_id}"
    
    def get_start_station(self) -> str:
        """
        Get the starting station.
        """
        return self.__start_station
    
    def get_dest_station(self) -> str:
        """
        Get the destination station.
        """
        return self.__dest_station
    
    def get_distance(self) -> float:
        """
        Get the distance between the two stations.
        """
        return self.__distance
    
    def get_travel_time(self) -> float:
        """
        Get the travel time between the two stations.
        """
        return self.__travel_time
    
    def get_path_codes(self) -> str:
        """
        Get the path codes.
        """
        return self.__path_codes
    
    def get_path_names(self) -> str:
        """
        Get the path names.
        """
        return self.__path_names
    
    def get_user_id(self) -> int:
        """
        Get the user id.
        """
        return self.__user_id
    
