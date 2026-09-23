import math as m

class DistanceHeuristic:
    """
    A class to represent a distance heuristic.
    
    Attributes
    ----------
    RADIUS : int
        The radius of the Earth.
            
    Methods
    -------        
    manhattan(lat1: float, lng1: float, lat2: float, lng2: float) -> float
        Get the Manhattan distance between two locations.
    euclidian(lat1: float, lng1: float, lat2: float, lng2: float) -> float
        Get the Euclidian distance between two locations.
    """
    
    def __init__(self):
        """
        Constructs all the necessary attributes for the DistanceHeuristic object.
        """
        # earth radius in km
        self.RADIUS = 6371
         
    def manhattan(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
            """
            Get the Manhattan distance between two locations.
                    
            Parameters
            ----------
            lat1 : float
                The latitude of the first location.
            lng1 : float
                The longitude of the first location.
            lat2 : float
                The latitude of the second location.
            lng2 : float
                The longitude of the second location.
                
            Returns
            -------
            float
                The Manhattan distance between two locations.
            """
            
            lat1_rad, lat2_rad, lng1_rad, lng2_rad = map(m.radians, [lat1, lat2, lng1, lng2])
            delta_lat = lat2_rad - lat1_rad
            delta_lng = lng2_rad - lng1_rad
            a = (m.sin(delta_lat / 2) ** 2 + m.cos(lat1_rad) * m.cos(lat2_rad) * m.sin(delta_lng / 2) ** 2)
            c = 2 * m.atan2(m.sqrt(a), m.sqrt(1 - a))
            return self.RADIUS * c

    def euclidian(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        
        """
        Get the Euclidian distance between two locations.
        
        Parameters
        ----------
        lat1 : float
            The latitude of the first location.
        lng1 : float
            The longitude of the first location.
        lat2 : float
            The latitude of the second location.
        lng2 : float
            The longitude of the second location.

        Returns
        -------
        float
            The Euclidian distance between two locations.

        """
        lat1, lng1, lat2, lng2 = map(m.radians, [lat1, lng1, lat2, lng2])
        return m.sqrt( self.RADIUS * ( (lat2 - lat1) ** 2 + (lng2 - lng1) ** 2 ))
