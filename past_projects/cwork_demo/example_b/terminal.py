from graphTraversal import GraphTraversal

class Terminal:
    """
    A class to represent access to application via terminal.

    Attributes
    ----------
    output : str
        the found path from the start to the end station in string format

    Methods
    -------
    get_valid_station_code(self,prompt):
        valid the user input and return the validated station code.

    run(self):
        run one of the four algorithms to find the shortest path between two stations.

    """
        
    def __init__(self):
        """
        Constructs all the necessary attributes for the Terminal object.
        """

        self._output = ""
        Terminal.run(self)
    
    def get_valid_station_code(self,prompt):
        """
        valid the user input and return the validated station code.

        Parameters
        ----------
            prompt : str
            the prompt message to ask the user to input the station code.

        """
        valid_station_codes = {'NS1': 'Jurong East', 'EW24': 'Jurong East', 'NS2': 'Bukit Batok', 'NS3': 'Bukit Gombak', 'NS4': 'Choa Chu Kang', 'NS5': 'Yew Tee', 'NS7': 'Kranji', 'NS8': 'Marsiling', 'NS9': 'Woodlands', 'TE2': 'Woodlands', 'NS10': 'Admiralty', 'NS11': 'Sembawang', 'NS12': 'Canberra', 'NS13': 'Yishun', 'NS14': 'Khatib', 'NS15': 'Yio Chu Kang', 'NS16': 'Ang Mo Kio', 'NS17': 'Bishan', 'CC15': 'Bishan', 'NS18': 'Braddell', 'NS19': 'Toa Payoh', 'NS20': 'Novena', 'NS21': 'Newton', 'DT11': 'Newton', 'NS22': 'Orchard', 'TE14': 'Orchard', 'NS23': 'Somerset', 'NS24': 'Dhoby Ghaut', 'NE6': 'Dhoby Ghaut', 'CC1': 'Dhoby Ghaut', 'NS25': 'City Hall', 'EW13': 'City Hall', 'NS26': 'Raffles Place', 'EW14': 'Raffles Place', 'NS27': 'Marina Bay', 'CE2': 'Marina Bay', 'TE20': 'Marina Bay', 'NS28': 'Marina South Pier', 'EW1': 'Pasir Ris', 'EW2': 'Tampines', 
                               'DT32': 'Tampines', 'EW3': 'Simei', 'EW4': 'Tanah Merah', 'CG': 'Tanah Merah', 'EW5': 'Bedok', 'EW6': 'Kembangan', 'EW7': 'Eunos', 'EW8': 'Paya Lebar', 'CC9': 'Paya Lebar', 'EW9': 'Aljunied', 'EW10': 'Kallang', 'EW11': 'Lavender', 'EW12': 'Bugis', 'DT14': 'Bugis', 'EW15': 'Tanjong Pagar', 'EW16': 'Outram Park', 'NE3': 'Outram Park', 'TE17': 'Outram Park', 'EW17': 'Tiong Bahru', 'EW18': 'Redhill', 'EW19': 'Queenstown', 'EW20': 'Commonwealth', 'EW21': 'Buona Vista', 'CC22': 'Buona Vista', 'EW22': 'Dover', 'EW23': 'Clementi', 'EW25': 'Chinese Garden', 'EW26': 'Lakeside', 'EW27': 'Boon Lay', 'EW28': 'Pioneer', 'EW29': 'Joo Koon', 'EW30': 'Gul Circle', 'EW31': 'Tuas Crescent', 'EW32': 'Tuas West Road', 'EW33': 'Tuas Link', 'CG1': 'Expo', 'DT35': 'Expo', 'CG2': 'Changi Airport', 'NE1': 'HarbourFront', 'CC29': 'HarbourFront', 
                               'NE4': 'Chinatown', 'DT19': 'Chinatown', 'NE5': 'Clarke Quay', 'NE7': 'Little India', 'DT12': 'Little India', 'NE8': 'Farrer Park', 'NE9': 'Boon Keng', 'NE10': 'Potong Pasir', 'NE11': 'Woodleigh', 'NE12': 'Serangoon', 'CC13': 'Serangoon', 'NE13': 'Kovan', 'NE14': 'Hougang', 'NE15': 'Buangkok', 'NE16': 'Sengkang', 'NE17': 'Punggol', 'CC2': 'Bras Basah', 'CC3': 'Esplanade', 'CC4': 'Promenade', 'DT15': 'Promenade', 'CC5': 'Nicoll Highway', 'CC6': 'Stadium', 'CC7': 'Mountbatten', 'CC8': 'Dakota', 'CC10': 'MacPherson', 'DT26': 'MacPherson', 'CC11': 'Tai Seng', 'CC12': 'Bartley', 'CC14': 'Lorong Chuan', 'CC16': 'Marymount', 'CC17': 'Caldecott', 'TE9': 'Caldecott', 'CC19': 'Botanic Gardens', 'DT9': 'Botanic Gardens', 'CC20': 'Farrer Road', 'CC21': 'Holland Village', 'CC23': 'one-north', 'CC24': 'Kent Ridge', 'CC25': 'Haw Par Villa', 
                               'CC26': 'Pasir Panjang', 'CC27': 'Labrador Park', 'CC28': 'Telok Blangah', 'CE1': 'Bayfront', 'DT16': 'Bayfront', 'DT1': 'Bukit Panjang', 'DT2': 'Cashew', 'DT3': 'Hillview', 'DT5': 'Beauty World', 'DT6': 'King Albert Park', 'DT7': 'Sixth Avenue', 'DT8': 'Tan Kah Kee', 'DT10': 'Stevens', 'TE11': 'Stevens', 'DT13': 'Rochor', 'DT17': 'Downtown', 'DT18': 'Telok Ayer', 'DT20': 'Fort Canning', 'DT21': 'Bencoolen', 'DT22': 'Jalan Besar', 'DT23': 'Bendemeer', 'DT24': 'Geylang Bahru', 'DT25': 'Mattar', 'DT27': 'Ubi', 'DT28': 'Kaki Bukit', 'DT29': 'Bedok North', 'DT30': 'Bedok Reservoir', 'DT31': 'Tampines West', 'DT33': 'Tampines East', 'DT34': 'Upper Changi', 'TE1': 'Woodlands North', 'TE3': 'Woodlands South', 'TE4': 'SpringLeaf', 'TE5': 'Lentor', 'TE6': 'Mayflower', 'TE7': 'Bright Hill', 'TE8': 'Upper Thomson', 'TE12': 'Napier', 
                               'TE13': 'Orchard Boulevard', 'TE15': 'Great World', 'TE16': 'Havelock', 'TE18': 'Maxwell', 'TE19': 'Shenton Way', 'TE22': 'Gardens by the Bay'}
        while True:
            code = input(prompt)
            if code in valid_station_codes.keys():
                return code
            elif code in valid_station_codes.values():
                for key, value in valid_station_codes.items():
                    if value == code:
                        return key
            else:
                print("Invalid station code. Please try again.")
                
    def run(self):
        """
        run one of the four algorithms to find the shortest path between two stations.
        
        """
        res = ""
        start = self.get_valid_station_code("Enter the starting station : ")
        end = self.get_valid_station_code("Enter the ending station : ")
        while start == end:
            print("Starting and ending stations are the same. Please try again.")
            start = self.get_valid_station_code("Enter the starting station : ")
            end = self.get_valid_station_code("Enter the ending station : ")

        #<option value='1'>Breadth First Search</option>
        #<option value='2'>Dijkstra</option>
        #<option value='3'>K Shortest Path</option>
        #<option value='4'>A Star</option>
        algorithm = input("Enter the algorithm (number) you want to use (1: BFS, 2: Dijsktra, 3: A star 4: K shortest path): ")
        print("Calculating path...")
        if algorithm not in ['1', '2', '3', '4']:
            print("Invalid algorithm. Please try again.")
            Terminal.run(self)
            
        if algorithm == '4':
            try:
                k = int(input("Enter the value of k: "))
            except:
                print("Invalid value of k. Please try again.")
                Terminal.run(self)
        else:
            k = 1
        
        myGraphTraversal = GraphTraversal()
        if algorithm == "4":
            result = myGraphTraversal.GetShortestPathStatic(start, end, algorithm,str(k))
            for route_num,route in list(result.items()):
                print(route_num)
                distance = route[0]
                time = route[1]
                codes = route[2]
                names = route[3]
                print(f"Distance: {distance}")
                print(f"Time: {time}")
                print("Path: ")
                res = ""
                for i in range(min(len(codes),len(names))):
                    if i == 0:
                        res = res + f"{codes[i]} : {names[i]}"
                    else:
                        res = res + f" -> {codes[i]} : {names[i]}"
                print(res)
        else:
            temp = myGraphTraversal.GetShortestPathStatic(start, end, algorithm, str(1))
            result = temp[0]
            distance,time,codes,names = result[0],result[1],result[2],result[3]
            print(f"Distance: {distance}")
            print(f"Time: {time}")
            print("Path: ")
            for i in range(len(codes)):
                if i == 0:
                    res = res + f"{codes[i]} : {names[i]}"
                else:
                    res = res + f" -> {codes[i]} : {names[i]}"
            print(res)

        
        print("run again or quit? q/r")
        choice = input("Enter your choice: ")
        if choice == 'r':
            Terminal.run(self)
        else:
            print("Program ended!")
            
if __name__ == "__main__":
    Terminal()