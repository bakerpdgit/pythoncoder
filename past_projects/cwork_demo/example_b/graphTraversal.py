from Route import Route
import csv
from abc import abstractmethod


class GraphTraversal:
    # Provides static-like methods to compute shortest paths and save routes to DB.
    """
    Class to provide static-like methods to compute shortest paths and save routes to the database.
    
    methods
    -------
    GetShortestPathStatic(start_station: str, end_station: str, algorithm: str) -> dict
        Get the shortest path between two stations using the specified algorithm.
    save_route_to_db(routes: list[Route])
        Save the routes to the database.

    """

    def GetShortestPathStatic(self, start_station: str, end_station: str, algorithm: str, k :int):
        """
        Get the shortest path between two stations using the specified algorithm.
        
        Parameters
        ----------
        start_station : str
            The starting station.
        end_station : str
            The destination station.
        algorithm : str
            The algorithm to use.

        Returns
        -------
        dict
            The shortest path between two stations.

        """
        result = []
        if algorithm == '1':
            data = BFS(start_station, end_station).run()
            result.append(data)
        elif algorithm == '2':
            data = Dijkstra(start_station, end_station).run()
            result.append(data)
        elif algorithm == '3':
            data = AStar(start_station, end_station).run()
            result.append(data)
        else:
            result = {}
            data = KShortestPath(start_station, end_station).run(int(k))
            for j, k in enumerate(data):
                result[j + 1] = k
        return result

    def save_route_to_db(self, routes: list[Route]):
        """
        Save the routes to the database.
        
        Parameters
        ----------
        routes : list[Route]
            The list of routes to save
        
        """
        import sqlite3
        import datetime

        db_connection = sqlite3.connect("instance/database.db")
        cursor = db_connection.cursor()

        for r in routes:
            start = r.get_start_station()
            dest = r.get_dest_station()
            distance = r.get_distance()
            travel_time = r.get_travel_time()
            path_codes = r.get_path_codes()
            path_names = r.get_path_names()
            user_id = r.get_user_id()
            
            
            sql_query = (
                "INSERT INTO route "
                "(start, dest, distance, travel_time, path_codes, path_names, user_id, save_datetime) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            
            cursor.execute(
                sql_query,
                (
                    start, dest, distance, travel_time,
                    path_codes, path_names, user_id,
                    datetime.datetime.now()
                )
            )

        db_connection.commit()
        db_connection.close()


class AlgorithmBase:
    def __init__(self, start_station: str, end_station: str):
        import math as m
        from heuristics import DistanceHeuristic as DH
        from Graph import Graph

        self.m = m
        self.start_station = start_station
        self.end_station = end_station
        self.heuristic = DH()
        self.graph = Graph()
        self.adjacency_list = self.graph.get_adjacency_list()
        self.stations_info = self.graph.get_station_info()
        self.interchange_stations = self.graph.get_interchange_stations()
        self.INVALID = 0.0, 0.0, [], []
        self.CRUISE_SPEED = 27.8
        self.ACCELERATION = 1.0
        self.REGULAR_STOPPING_TIME = 28
        self.INTERCHANGE_STOPPING_TIME = 35

    @abstractmethod
    def run(self):
        pass

    def _evaluate_time_for_distance(self, distance_meters: float) -> float:
        accel_decel_distance = (self.CRUISE_SPEED ** 2) / self.ACCELERATION
        if distance_meters >= accel_decel_distance:
            acceleration_time = self.CRUISE_SPEED / self.ACCELERATION
            accel_distance = 0.5 * self.ACCELERATION * (acceleration_time ** 2)
            cruise_distance = distance_meters - 2 * accel_distance
            cruise_time = cruise_distance / self.CRUISE_SPEED
            return 2 * acceleration_time + cruise_time
        else:
            return 2 * self.m.sqrt(distance_meters / self.ACCELERATION)

    def _calculate_travel_cost(self, code, neighbour, total_distance, total_time):
        travel_info = self.adjacency_list[code][neighbour]
        travel_cost = travel_info["cost"]
        travel_method = travel_info["method"]

        if travel_method == "train":
            total_distance += travel_cost
            total_time += self._evaluate_time_for_distance(travel_cost)
            if code not in self.interchange_stations:
                total_time += self.REGULAR_STOPPING_TIME
            else:
                total_time += self.INTERCHANGE_STOPPING_TIME
        elif travel_method == "transfer":
            total_time += travel_cost
        return total_distance, total_time

    def reconstruct_path(self, previous):
        from custom_implementations.custom_stack import Stack as S
        path = []
        current_station = self.end_station
        if current_station not in previous or previous[current_station] is None:
            return self.INVALID

        while current_station != self.start_station:
            if current_station not in previous:
                return self.INVALID
            path.append(current_station)
            current_station = previous[current_station]
        path.append(self.start_station)

        path_stack = S()
        while path:
            path_stack.push(path[0])
            path.remove(path[0])
        while not path_stack.is_empty():
            path.append(path_stack.pop())

        station_names = [self.stations_info[s].get_station_name() for s in path]
        total_distance = 0.0
        total_time = 0.0

        for i, code in enumerate(path):
            if i < len(path) - 1:
                neighbour = path[i + 1]
                if neighbour not in self.adjacency_list[code]:
                    continue
                total_distance, total_time = self._calculate_travel_cost(
                    code, neighbour, total_distance, total_time
                )

        return total_distance, total_time, path, station_names

###########################################
# GROUP A Skill:  Graph Traversal BFS     #
###########################################

class BFS(AlgorithmBase):
    def __init__(self, start_station: str, end_station: str):
        super().__init__(start_station, end_station)

    def run(self):
        from custom_implementations.custom_queue import Queue as Q

        queue = Q()
        visited_stations = {node: False for node in self.adjacency_list}
        previous = {node: None for node in self.adjacency_list}

        queue.enqueue(self.start_station)
        visited_stations[self.start_station] = True

        if self.start_station == self.end_station:
            return self.INVALID

        while not queue.is_empty():
            current_station = queue.dequeue()

            if current_station == self.end_station:
                break

            for neighbour in self.adjacency_list[current_station].keys():
                if not visited_stations[neighbour]:
                    visited_stations[neighbour] = True
                    previous[neighbour] = current_station
                    queue.enqueue(neighbour)

        return self.reconstruct_path(previous)

################################################
# GROUP A Skill:  Graph Traversal Dijkstra     #
################################################

class Dijkstra(AlgorithmBase):
    def __init__(self, start_station: str, end_station: str):
        super().__init__(start_station, end_station)

    def run(self):
        from custom_implementations.custom_queue import PriorityQueue as PQ
        import math as m

        if self.start_station == self.end_station:
            return self.INVALID

        priority_queue = PQ()
        visited_stations = {node: False for node in self.adjacency_list}
        time_map = {node: m.inf for node in self.adjacency_list}
        previous_stations = {node: None for node in self.adjacency_list}

        time_map[self.start_station] = 0
        previous_stations[self.start_station] = None
        priority_queue.enqueue((0, self.start_station))

        while not priority_queue.is_empty():
            current_station = priority_queue.dequeue()[1]

            if current_station == self.end_station:
                break

            visited_stations[current_station] = True

            for neighbour, travel_info in self.adjacency_list[current_station].items():
                travel_cost = travel_info["cost"]
                if travel_info["method"] == "train":
                    travel_cost = self._evaluate_time_for_distance(travel_cost)
                new_distance = time_map[current_station] + travel_cost

                if new_distance < time_map[neighbour]:
                    time_map[neighbour] = new_distance
                    previous_stations[neighbour] = current_station
                    priority_queue.enqueue((new_distance, neighbour))

        return self.reconstruct_path(previous_stations)


##########################################
# GROUP A Skill:  Graph Traversal A*     #
##########################################

class AStar(AlgorithmBase):
    def __init__(self, start_station, end_station):
        super().__init__(start_station, end_station)

    def run(self):
        from custom_implementations.custom_queue import PriorityQueue as PQ
        import math as m

        if self.start_station == self.end_station:
            return self.INVALID

        closed_list = []
        priority_queue = PQ()
        visited_stations = {node: False for node in self.adjacency_list}
        time_map = {node: m.inf for node in self.adjacency_list}
        previous_stations = {node: None for node in self.adjacency_list}

        time_map[self.start_station] = 0
        priority_queue.enqueue((0, self.start_station))

        end_info = self.stations_info[self.end_station]
        end_lng = float(end_info.get_lng())
        end_lat = float(end_info.get_lat())

        while not priority_queue.is_empty():
            current_station = priority_queue.dequeue()[1]

            if current_station == self.end_station:
                break

            visited_stations[current_station] = True
            closed_list.append(current_station)
            for neighbour, travel_info in self.adjacency_list[current_station].items():
                if neighbour in closed_list:
                    continue
                travel_cost = travel_info["cost"]
                if travel_info["method"] == "train":
                    travel_cost = self._evaluate_time_for_distance(travel_cost)

                tentative_time = time_map[current_station] + travel_cost
                if tentative_time < time_map[neighbour]:
                    time_map[neighbour] = tentative_time
                    previous_stations[neighbour] = current_station
                    distance_estimate = self.heuristic.euclidian(
                        float(self.stations_info[neighbour].get_lat()),
                        float(self.stations_info[neighbour].get_lng()),
                        end_lat, end_lng
                    )
                    heuristic_time = self._evaluate_time_for_distance(distance_estimate)
                    priority_queue.enqueue((time_map[neighbour] + heuristic_time, neighbour))

        if self.end_station not in previous_stations or current_station != self.end_station:
            return self.INVALID

        return self.reconstruct_path(previous_stations)

##########################################################################################
# GROUP A Skill:  Complex user defined algorithm – K shortest path / Yen’s algorithm     #
##########################################################################################

class KShortestPath(AlgorithmBase):
    def __init__(self, start_station, end_station):
        super().__init__(start_station, end_station)

    def run(self, k):
        from custom_implementations.linked_list import LinkedList as LL

        if self.start_station == self.end_station:
            return [self.INVALID]

        myAStar = AStar(self.start_station, self.end_station)
        first_path = myAStar.run()
        if not first_path[2]:
            return []

        shortest_paths = [first_path]
        candidate_paths = LL()

        # Outer loop for finding kth shortest paths
        for outer in range(1, k):
            previous_path = shortest_paths[-1]
            _, _, route, _ = previous_path

            # Reverse the route as per the algorithm
            route.reverse()

            # Iterate through route segments
            for i in range(len(route) - 1):
                removed_edges = []

                # Remove edges that are in previous shortest paths
                for j in range(len(shortest_paths)):
                    if shortest_paths[j][2][:i] == route[:i]:
                        start_node = shortest_paths[j][2][i]
                        destination_node = shortest_paths[j][2][i + 1]
                        if destination_node in self.adjacency_list[start_node]:
                            removed_edges.append(
                                (start_node, destination_node, self.adjacency_list[start_node][destination_node])
                            )
                            removed_edges.append(
                                (destination_node, start_node, self.adjacency_list[destination_node][start_node])
                            )
                            del myAStar.adjacency_list[start_node][destination_node]
                            del myAStar.adjacency_list[destination_node][start_node]

                new_path = myAStar.run()
                spur_route = new_path[2]

                # Restore removed edges
                for (start_node, destination_node, edge_info) in removed_edges:
                    myAStar.adjacency_list[start_node][destination_node] = edge_info

                if spur_route:
                    new_route = route[:i] + spur_route
                    distance, _, _, names = new_path
                    time = 0.0
                    # Recompute distance and time for the new route
                    for n in range(len(new_route) - 1):
                        start_node, destination_node = new_route[n], new_route[n + 1]
                        if destination_node not in myAStar.adjacency_list[start_node]:
                            continue
                        distance, time = myAStar._calculate_travel_cost(
                            start_node, destination_node, distance, time
                        )
                    candidate_paths.append((distance, time, new_route, names))
            if not candidate_paths:
                break

        candidate_paths.merge_sort()
        for _ in range(0, k - 1):
            shortest_paths.append(candidate_paths.dequeue())

        return shortest_paths


# # Example usage:
# station1 = ["TE4"]
# station2 = ["EW7"]
# for s1, s2 in zip(station1, station2):
#     print(f"Shortest path from {s1} to {s2}")
#     print(BFS(s1, s2).run())
#     print(Dijkstra(s1, s2).run())
#     print(AStar(s1, s2).run())
#     print(KShortestPath(s1, s2).run(3))