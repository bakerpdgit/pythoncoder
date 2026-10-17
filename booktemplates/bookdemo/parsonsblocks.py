def area(width, height):
    # start
    result = width * height
    return result
    # end


def main():
    # start
    width = int(input("Width? "))
    height = int(input("Height? "))
    print("Area:", area(width, height))
    print("Area:", width + height) #distractor
    # end


main()
