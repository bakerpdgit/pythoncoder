from Station import Station

def get_all_stations():
    """
    Read the station data from the file and return a dictionary of station objects.
    """
    station_list = {}
    with open("data/stations.csv", 'r') as stations_file:
        for line in stations_file:
            line = line.strip()
            fields = line.split(",")
            #adj_stations = []

            # Station_Code,Station_Name,Line_Color,Line_Name,lat,lng,adjacent_stations
            #
            if len(fields) != 7:
                raise Exception(" Wrong station data file. Expecting 7 columns")
            
                # *** skip the first line with header
            if fields[0] != "Station_Code":
                station_code = fields[0]
                station_name = fields[1]
                line_color = fields[2]
                line_name = fields[3]
                lat = fields[4]
                lng = fields[5]
                adj_stations = fields[len(fields) - 1].split("#")
                station_list[station_code] = Station(station_code, station_name, line_color, line_name, lat, lng, adj_stations)
    return station_list

def get_all_station_codes(station_list):
    """
    Return a list of station codes sorted in alphabetical order.
    """
    station_codes = []
    for s in g_station_list.values():
        s_code = s.get_station_code()
        s_name = s.get_station_name()
        code_name = s_code + " - " + s_name
        station_codes.append(code_name)

    station_codes.sort()

    return station_codes

"""
Global station list and station codes list
"""
g_station_list = get_all_stations()

g_station_codes = get_all_station_codes(g_station_list)

