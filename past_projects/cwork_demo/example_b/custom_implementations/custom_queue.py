from custom_implementations.binary_heap import BinaryHeap

############################
# GROUP A Skill : Queue    #
############################

class EmptyQueueError(Exception):
    pass
      
class PriorityQueue:
    def __init__(self):
        self.data = BinaryHeap()
        
    def __repr__(self):
        return self.data.__repr__()

    def enqueue(self, element):
        self.data.insert(element)
        
    def dequeue(self):
        if self.data.is_empty():
            raise EmptyQueueError("cannot dequeue from an empty queue!")
        return self.data.extract_min()

    def peek(self):
        return self.data.get_minimum()

    def is_empty(self):
        return self.data.is_empty()
    
    def size(self):
        return self.data.size()

class Queue:
    def __init__(self):
        self._list = []
        self._head = 0
        self._tail = 0
        
    def __repr__(self):
        return self._list
        
    def enqueue(self, element):
        self._list.append(element)
        self._tail += 1

    def enqueue(self, element):
        self._list.append(element)
        self._tail += 1

    def dequeue(self):
        if self.is_empty():
            raise EmptyQueueError("cannot dequeue from an empty queue!")
        value = self._list[self._head]
        self._head += 1
        return value

    def peek(self):
        if self.is_empty():
            raise EmptyQueueError("cannot peek from an empty queue!")
        return self._list[self._head]

    def is_empty(self):
        return self._head == self._tail

    def size(self):
        return self._tail - self._head
    
    def sort(self):
        self._list.sort()