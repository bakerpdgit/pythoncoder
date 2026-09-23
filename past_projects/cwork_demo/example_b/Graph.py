import sqlite3
from Station import Station
from StationList import g_station_list

class Graph:
    """
    Class to represent the graph of stations and connections in the MRT network.

    Attributes
    ----------

    station_list : dict[str, Station]
        The dictionary of station objects.
    adjacency_list : dict[str, dict[str, float | str]]
        The adjacency list of the graph.
    station_info : dict[str, Station]
        The detailed station information.
    interchange_stations : list[str]    
        The list of interchange stations.
    __read_db : bool    
        Flag indicating data source (DB vs CSV).

    Methods
    -------
    generate_station_data()
        Generate the station data.
    _add_stations()
        Add station details to the station list based on the data source.
    _add_transfer_cost()    
        Add transfer cost data between stations.
    _add_connection_cost()  
        Add connection cost data between stations based on the specified travel method.
    _update_connections(station1: str, station2: str, distance: float, travel_method: str) -> None  
        Update the connection information for a given station.
    _populate_adjacency_list()  
        Populate the adjacency list by mapping each station code to its connections.
    get_adjacency_list() -> dict[str, dict[str, float | str]]   
        Return the computed adjacency list of the graph.
    get_station_info() -> dict[str, Station]    
        Return the detailed station information.
    get_interchange_stations() -> list[str] 
        Return the list of interchange stations.

    """
    def __init__(self):
        """
        Constructs all the necessary attributes for the Graph object.
        """
        # Initialize station list using a global copy
        self.__station_list = g_station_list.copy()
        self.adjacency_list = {}
        self.station_info = {}
        self.interchange_stations = []
        self.__read_db = True  # Flag indicating data source (DB vs CSV)

        # Generate station data
        self.generate_station_data()

    def generate_station_data(self):
        """
        Generate the station data by adding stations, transfer costs, connection costs, and populating the adjacency list.
        """

        # Generate the station data by adding stations, transfer costs, connection costs, and populating the adjacency list.

        self._add_stations()
        self._add_transfer_cost()
        self._add_connection_cost()
        self._populate_adjacency_list()

    def _add_stations(self):
        """
        Add station details to the station list based on the data source.
        """

        # Add station details to the station list based on the data source;reads from DB if __read_db is True, otherwise from CSV.
        
        if self.__read_db:
            db_connection = sqlite3.connect("instance/database.db")
            cursor = db_connection.cursor()

            # Get neighbour data for stations
            neighbour_sql_query = "SELECT station_code, neighbour FROM adjacent_stations"
            cursor.execute(neighbour_sql_query)
            neighbour_output = cursor.fetchall()

            # Build neighbour mapping (bi-directional)
            neighbours = {}
            for row in neighbour_output:
                station_code = row[0]
                neighbour = row[1]

                if station_code not in neighbours:
                    neighbours[station_code] = [neighbour]
                else:
                    neighbours[station_code].append(neighbour)

                # Add reverse connection for neighbour
                if neighbour not in neighbours:
                    neighbours[neighbour] = [station_code]
                else:
                    neighbours[neighbour].append(station_code)

            # Get station data from database
            station_sql_query = (
                "SELECT station_code, station_name, line_colour, line_name, latitude, longitude FROM station"
            )
            cursor.execute(station_sql_query)
            output = cursor.fetchall()

            for row in output:
                station_code = row[0]
                station_name = row[1]
                line_color = row[2]
                line_name = row[3]
                lat = row[4]
                lng = row[5]
                adj_stations = neighbours.get(station_code, [])

                # Create Station object and add to station list
                self.__station_list[station_code] = Station(
                    station_code,
                    station_name,
                    line_color,
                    line_name,
                    lat,
                    lng,
                    adj_stations
                )
            db_connection.close()

        else:
            # Read station data from CSV file if not reading from DB
            with open("data/stations.csv", 'r') as stations_file:
                for line in stations_file:
                    line = line.strip()
                    fields = line.split(",")
                    station_code = fields[0]
                    station_name = fields[1]
                    line_color = fields[2]
                    line_name = fields[3]
                    lat = fields[4]
                    lng = fields[5]
                    # Last field contains adjacent stations separated by '#'
                    adj_stations = fields[-1].split("#")

                    # Create Station object and add to station list
                    self.__station_list[station_code] = Station(
                        station_code,
                        station_name,
                        line_color,
                        line_name,
                        lat,
                        lng,
                        adj_stations
                    )

    def _add_connection_cost(self):
        """
        Add connection cost data between stations based on the specified travel method.
        """
        # Add connection cost data between stations based on the specified travel method.
        if self.__read_db:
            db_connection = sqlite3.connect("instance/database.db")
            cursor = db_connection.cursor()
            # Get distance data between stations
            sql_query = "SELECT station1, station2, distance FROM distance"
            cursor.execute(sql_query)
            output = cursor.fetchall()

            for row in output:
                station1 = row[0]
                station2 = row[1]
                distance = row[2]
                # Update connection costs in both directions for train travel
                self._update_connections(station1, station2, distance, "train")
                self._update_connections(station2, station1, distance, "train")
            db_connection.close()
        else:
            # Read connection data from CSV file
            with open("data/distances.csv", 'r') as distances_file:
                for line in distances_file:
                    line = line.strip()
                    fields = line.split(",")

                    if len(fields) != 4:
                        raise Exception("Wrong connection data file. Expecting 4 columns")

                    if fields[0] != "Station1":
                        station1 = fields[0]
                        station2 = fields[1]
                        # Multiply by 1000 to convert distance as required
                        distance = float(fields[3]) * 1000
                        # Update connection data for both directions
                        self._update_connections(station1, station2, distance, "train")
                        self._update_connections(station2, station1, distance, "train")

    def _add_transfer_cost(self):
        """
        Add transfer cost data between stations.
        """
        # Add transfer cost data between stations.

        if self.__read_db:
            db_connection = sqlite3.connect("instance/database.db")
            cursor = db_connection.cursor()
            # Get transfer time data from the database
            sql_query = "SELECT start_code, end_code, transfer_time_seconds FROM transfer_time"
            cursor.execute(sql_query)
            output = cursor.fetchall()

            for row in output:
                station1 = row[0]
                station2 = row[1]
                transfer_time = row[2]
                # Update transfers for both directions
                self._update_connections(station1, station2, transfer_time, "transfer")
                self._update_connections(station2, station1, transfer_time, "transfer")
            db_connection.close()
        else:
            # Read transfer cost data from CSV file
            with open("data/transfer timings.csv", 'r') as transfers_file:
                for line in transfers_file:
                    line = line.strip()
                    fields = line.split(",")

                    if fields[0] != "Station Name":
                        station1 = fields[2]
                        station2 = fields[4]
                        transfer_time = float(fields[5])
                        # Record interchange stations
                        self.interchange_stations.append(station1)
                        self.interchange_stations.append(station2)
                        # Update transfer connection data for both directions
                        self._update_connections(station1, station2, transfer_time, "transfer")
                        self._update_connections(station2, station1, transfer_time, "transfer")

    def _update_connections(self, station1: str, station2: str, distance: float, travel_method: str) -> None:
        """
        Update the connection information for a given station.
        
        Parameters
        ----------
        station1 : str
            The starting station.
        station2 : str
            The destination station.
        distance : float
            The distance between the two stations.
        travel_method : str
            The travel method.
            
        """
        # Update the connection information for a given station.
        start_station: Station = self.__station_list[station1]
        # Get the current connections for the start station
        start_connection: dict[str, dict[str, float | str]] = start_station.get_connections()
        # Update connection data for the given station2
        start_connection[station2] = {"cost": distance, "method": travel_method}
        start_station.set_connections(start_connection)

    def _populate_adjacency_list(self):
        """
        Populate the adjacency list by mapping each station code to its connections.
        """
        # Populate the adjacency list by mapping each station code to its connections.
        for station_code, station in self.__station_list.items():
            self.adjacency_list[station_code] = station.get_connections()

    def get_adjacency_list(self):
        """
        Return the computed adjacency list of the graph.
        """
        #Return the computed adjacency list of the graph.
        return self.adjacency_list

    def get_station_info(self):
        """
        Return the detailed station information.
        """
        #Return the detailed station information.
        return self.__station_list

    def get_interchange_stations(self):
        """
        Return the list of interchange stations.
        """
        # Return the list of interchange stations.
        return self.interchange_stations