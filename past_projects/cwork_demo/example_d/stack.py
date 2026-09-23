class Stack():
    ###############################
    # Skill group A: stacks and stack operations
    ###############################
    def __init__(self):
        self.__stack = []

    def push(self, item):
        self.__stack.append(item)

    def pop(self):
        if self.isEmpty():
            return None
        return self.__stack.pop()
    
    def peek(self):
        return self.__stack[-1]
    
    def isEmpty(self):
        return self.__stack == []
    
    def clear(self):
        self.__stack = []

    def size(self):
        return len(self.__stack)