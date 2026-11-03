#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node *next;
} Node;

Node *createList(int n) {
    Node *head = NULL;
    Node *tail = NULL;
    for (int i = 0; i < n; i++) {
        Node *p = (Node *)malloc(sizeof(Node));
        p->data = i;
        p->next = NULL;
        if (head == NULL) {
            head = p;
        } else {
            tail->next = p;
        }
        tail = p;
    }
    return head;
}

int main() {
    Node *list = createList(5);
    while (list != NULL) {
        printf("%d ", list->data);
        list = list->next;
    }
    printf("\n");
    return 0;
}

int data;
