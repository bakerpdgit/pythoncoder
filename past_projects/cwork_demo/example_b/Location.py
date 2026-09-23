from heuristics import DistanceHeuristic

class Location:
    """
    A class to represent a location in the MRT network.
        
        Attributes
        ----------
        lat : float
            The latitude of the location.
        lng : float
            The longitude of the location.
        heuristic : DistanceHeuristic
            The distance heuristic.

        Methods
        -------        
        distance_to(other: 'Location') -> float
            Get the distance to another location.
        lat() -> float
            Get the latitude of the location.
        lng() -> float
            Get the longitude of the    location.
        distance_to(other: 'Location') -> float
            Get the distance to another location.

    """
    def __init__(self, lat: float, lng: float):
        """
        Constructs all the necessary attributes for the Location object.
            
            Parameters
            ----------
            lat : float
                The latitude of the location.
            lng : float
                The longitude of the location.
                """
        self._lat = lat
        self._lng = lng
        self.heuristic = DistanceHeuristic()

    @property
    def lat(self) -> float:
        """
        Get the latitude of the location.
        """
        return self._lat

    @property
    def lng(self) -> float:
        """ 
        Get the longitude of the location.
        """

        return self._lng

    def distance_to(self, other: 'Location') -> float:
        """ 
        Get the distance to another location.
        
        Parameters
        ----------
        other : Location
            The other location.
        """
        return self.heuristic.euclidean(self.lat, self.lng, other.lat, other.lng)