##################################
# GROUP A Skill: Binary Heap     #
##################################

class Error(Exception):
    pass

class BinaryHeap:
    def __init__(self):
        self.heap = []

    def __repr__(self):
        return self.heap
    
    def parent(self, index):
        return (index - 1) // 2

    def left(self, index):
        return 2 * index + 1

    def right(self, index):
        return 2 * index + 2
    
    def print_heap(self):
        print(self.heap)

    def insert(self, element):
        self.heap.append(element)
        self._bubble_up(len(self.heap) - 1)

    def get_minimum(self):
        if self.is_empty():
            raise Error("cannot peek from an tree!")
        return self.heap[0]

    def is_empty(self):
        return len(self.heap) == 0

    def size(self):
        return len(self.heap)

    def _bubble_up(self, index):
        element = self.heap[index]
        while index > 0:
            parent_index = self.parent(index)
            parent_element = self.heap[parent_index]
            if parent_element > element:
                self.heap[index] = parent_element
                index = parent_index
            else:
                break
        self.heap[index] = element

    def extract_min(self):
        if self.is_empty():
            raise Error("cannot extract from an empty tree!")
        min_element = self.heap[0]
        last_element = self.heap.pop()
        if not self.is_empty():
            self.heap[0] = last_element
            self._bubble_down(0)
        return min_element

    def _bubble_down(self, index):
        length = len(self.heap)
        element = self.heap[index]
        while True:
            left_index = self.left(index)
            right_index = self.right(index)
            min_index = index

            if left_index < length and self.heap[left_index] < element:
                min_index = left_index
            if right_index < length and self.heap[right_index] < self.heap[min_index]:
                min_index = right_index
            if min_index == index:
                break
            self.heap[index] = self.heap[min_index]
            index = min_index
        self.heap[index] = element