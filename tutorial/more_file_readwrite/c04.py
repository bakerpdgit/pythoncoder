# complete this code to add three more names to the file
PREFIX = "\n"
file = o___("names.txt", "_")
for count in range(3):
  name = input("enter a new name: ")
  file._____(PREFIX + name)
file.close()

# now let's check the contents
file = open("names.txt", "r")
for line in file:
  print(line.strip())
file.close()